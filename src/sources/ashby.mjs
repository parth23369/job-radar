// Ashby public job board API. Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
import { fetchJson, log, mapLimit } from "../util.mjs";

const INTERVAL = { "1 YEAR": "year", "1 MONTH": "month", "1 HOUR": "hour" };

export async function fetchAshbyBoard(token) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
  return (data.jobs || []).filter((j) => j.isListed !== false).map((j) => {
    const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
    const locs = [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join(" / ");
    return {
      uid: `ashby:${token}:${j.id}`,
      source: "Ashby",
      company: token.charAt(0).toUpperCase() + token.slice(1),
      title: j.title || "",
      location: locs,
      isRemote: j.isRemote === true || j.workplaceType === "Remote" || /remote/i.test(locs),
      country: j.address?.postalAddress?.addressCountry || null,
      url: j.jobUrl,
      applyUrl: j.applyUrl || j.jobUrl,
      postedAt: j.publishedAt,
      salary: salary
        ? { min: salary.minValue, max: salary.maxValue, currency: salary.currencyCode, interval: INTERVAL[salary.interval] || "year" }
        : null,
      description: j.descriptionPlain || ""
    };
  });
}

export async function fetchAshby(tokens) {
  const results = await mapLimit(tokens, 6, async (t) => {
    try { const jobs = await fetchAshbyBoard(t); if (tokens.length <= 60) log(`Ashby ${t}: ${jobs.length}`); return jobs; }
    catch (err) { log(`⚠ Ashby ${t} skipped: ${err.message}`); return []; }
  });
  const all = results.flat();
  log(`Ashby: ${all.length} postings from ${tokens.length} boards`);
  return all;
}
