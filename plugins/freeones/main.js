function lowercase(str) {
  return str.toLowerCase();
}

module.exports = async ({
  $createImage,
  args,
  $axios,
  $moment,
  $cheerio,
  $throw,
  $log,
  actorName,
}) => {
  if (!actorName)
    $throw("Uh oh. You shouldn't use the plugin for this type of event");

  $log(
    `Scraping freeones date for ${actorName}, dry mode: ${args.dry || false}...`
  );

  const blacklist = (args.blacklist || []).map(lowercase);
  if (!args.blacklist) $log("No blacklist defined, returning everything...");

  function isBlacklisted(prop) {
    return blacklist.includes(lowercase(prop));
  }

  //Check imperial unit preference
  const imp_pref = args.useImperial;
  if (!imp_pref) {
    $log("Imperial preference not set. Using metric values...");
  } else {
    $log("Imperial preference indicated. Using imperial values...");
  }

  /* const petiteThreshold = parseInt(args.petiteThreshold) || 160; */

  const url = `https://freeones.xxx/${actorName.replace(/ /g, "-")}/profile`;
  let html;
  try {
    html = (await $axios.get(url)).data;
  } catch (e) {
    $throw("Error fetching url: " + e.message);
  }

  const $ = $cheerio.load(html);

  function getNationality() {
    if (isBlacklisted("nationality")) return {};
    $log("Getting nationality...");

    const nat_sel = $(
      '[data-test="section-personal-information"] a[href*="countryCode%5D"]'
    );

    if (!nat_sel.length) {
      $log("Nationality not found");
      return {};
    }

    const nationality = $(nat_sel).attr("href").split("=").slice(-1)[0];
    if (!nationality) {
      return {};
    }
    return {
      nationality,
    };
  }

  function getHeight() {
    if (isBlacklisted("height")) return {};
    $log("Getting height...");

    const htsel = $('[data-test="link_height"] .text-underline-always');
    if (!htsel) return {};

    const rawht = $(htsel).text();
    const ht_cm = rawht.match(/\d+cm/)[0];
    if (!ht_cm) return {};
    let hgt = parseInt(ht_cm.replace("cm", ""));
    if (!imp_pref) return { height: hgt };
    hgt *= 0.033;
    hgt = Math.round((hgt + Number.EPSILON) * 100) / 100;
    return { height: hgt };
  }

  function getWeight() {
    if (isBlacklisted("weight")) return {};
    $log("Getting weight...");

    const wtsel = $('[data-test="link_weight"] .text-underline-always');
    if (!wtsel) return {};

    const rawwt = $(wtsel).text();
    const wt_kg = rawwt.match(/\d+kg/)[0];
    if (!wt_kg) return {};
    let wgt = parseInt(wt_kg.replace("kg", ""));
    if (!imp_pref) return { weight: wgt };
    wgt *= 2.2;
    wgt = Math.round((wgt + Number.EPSILON) * 100) / 100;
    return { weight: wgt };
  }

  function getZodiac() {
    if (isBlacklisted("zodiac")) return {};
    $log("Getting zodiac sign...");

    const zod_sel = $('[data-test="link_zodiac"] .text-underline-always');
    if (!zod_sel) return {};
    const rawzod = $(zod_sel).text();
    const zod_name = rawzod.split(" (")[0];

    return { zodiac: zod_name };
  }

  function getBirthplace() {
    if (isBlacklisted("birthplace")) return {};
    $log("Getting birthplace...");

    const bcity_sel = $(
      '[data-test="section-personal-information"] a[href*="placeOfBirth"]'
    );
    const bcity_name = bcity_sel.length
      ? $(bcity_sel).attr("href").split("=").slice(-1)[0]
      : null;
    let bplace = "";
    if (!bcity_name) {
      $log("No birthplace found");
      return {};
    } else {
      const bstate_sel = $(
        '[data-test="section-personal-information"] a[href*="province"]'
      );
      const bstate_name = bstate_sel.length
        ? $(bstate_sel).attr("href").split("=").slice(-1)[0]
        : null;
      if (!bstate_name) {
        $log("No birth province found, just city!");
        bplace = bcity_name;
        return { birthplace: bplace };
      } else {
        bplace = bcity_name + ", " + bstate_name.split("-")[0].trim();
        return { birthplace: bplace };
      }
    }
  }

  function scrapeText(prop, selector) {
    if (isBlacklisted(prop)) return {};
    $log(`Getting ${prop}...`);

    const el = $(selector);
    if (!el) return {};

    return { [prop]: el.text() };
  }

  async function getAvatar() {
    if (args.dry) return {};
    if (isBlacklisted("avatar")) return {};
    $log("Getting avatar...");

    const imgEl = $(".profile-header .img-fluid");
    if (!imgEl) return {};

    const url = $(imgEl).attr("src");
    const imgId = await $createImage(url, `${actorName} (avatar)`);

    return { avatar: imgId };
  }

  function getAge() {
    if (isBlacklisted("bornOn")) return {};
    $log("Getting age...");

    const aTag = $('[data-test="section-personal-information"] a');
    if (!aTag) return {};

    const href = $(aTag).attr("href");
    const yyyymmdd = href.match(/\d\d\d\d-\d\d-\d\d/);

    if (yyyymmdd && yyyymmdd.length) {
      const date = yyyymmdd[0];
      const timestamp = $moment(date, "YYYY-MM-DD").valueOf();
      return {
        bornOn: timestamp,
      };
    } else {
      $log("Could not find actor birth date.");
      return {};
    }
  }

  function getAlias() {
    if (isBlacklisted("aliases")) return {};
    $log("Getting aliases...");

    const alias_sel = $(
      '[data-test="section-alias"] p[data-test*="p_aliases"]'
    );
    const alias_text = alias_sel.text();
    const alias_name =
      alias_text && !/unknown/.test(alias_text) ? alias_text.trim() : null;
    if (!alias_name) return {};
    const alias_fin = alias_name.split(/,\s*/g);

    return { aliases: alias_fin };
  }

  const custom = {
    ...scrapeText(
      "hair color",
      '[data-test="link_hair_color"] .text-underline-always'
    ),
    ...scrapeText(
      "eye color",
      '[data-test="link_eye_color"] .text-underline-always'
    ),
    ...scrapeText(
      "ethnicity",
      '[data-test="link_ethnicity"] .text-underline-always'
    ),
    ...getHeight(),
    ...getWeight(),
    ...getBirthplace(),
    ...getZodiac(),
  };

  const data = {
    ...getNationality(),
    ...getAge(),
    ...getAlias(),
    ...(await getAvatar()),
    custom,
  };

  if (!blacklist.includes("labels")) {
    data.labels = [];
    if (custom["hair color"]) data.labels.push(`${custom["hair color"]} Hair`);
    if (custom["eye color"]) data.labels.push(`${custom["eye color"]} Eyes`);
    if (custom.ethnicity) data.labels.push(custom.ethnicity);
    /* if (custom.height && custom.height <= petiteThreshold)
      data.labels.push("Petite"); */
  }

  if (args.dry === true) {
    $log("Would have returned:", data);
    return {};
  }
  return data;
};
