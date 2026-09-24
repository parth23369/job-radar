// Adzuna job search API (India). Docs: https://developer.adzuna.com/
// Note: Adzuna returns a description *snippet* (a few hundred characters), not the full JD.
import { fetchJson, htmlToText, log } from "../util.mjs";

export async function fetchAdzuna(cfg, minLpa) {
  const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = process.env;
  if (!id || !key) { log("⚠ Adzuna skipped: ADZUNA_APP_ID / ADZUNA_APP_KEY not set"); return []; }

  const jobs = [];
  for (const q of cfg.queries) {
    const params = new URLSearchParams({
      app_id: id, app_key: key, what: q, what_exclude: cfg.exclude,
      results_per_page: String(cfg.resultsPerQuery), max_days_old: "2", sort_by: "date",
      salary_min: String(minLpa * 100_000), "content-type": "application/json"
    });
    try {
      const data = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${cfg.country}/search/1?${params}`);
      for (const r of data.results || []) {
        jobs.push({
          uid: `adzuna:${r.id}`,
          source: "Adzuna",
          company: r.company?.display_name || "Unknown company",
          title: (r.title || "").replace(/<[^>]+>/g, "").replace(/(\s*[-–—.]\s*){2,}/g, " - ").replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, ""),
          location: r.location?.display_name || "India",
          isRemote: /remote|work from home|wfh/i.test(`${r.title} ${r.description}`),
          country: "IN",
          url: r.redirect_url,
          postedAt: r.created,
          salary: r.salary_min || r.salary_max
            ? { min: r.salary_min, max: r.salary_max, currency: "INR", interval: "year", predicted: String(r.salary_is_predicted) === "1" }
            : null,
          description: htmlToText(r.description || "")
        });
      }
      log(`Adzuna "${q}": ${data.results?.length || 0}`);
    } catch (err) {
      log(`⚠ Adzuna "${q}" failed: ${err.message}`);
    }
  }
  return jobs;
}
