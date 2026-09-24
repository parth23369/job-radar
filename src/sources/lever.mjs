// Lever public postings API. Docs: https://github.com/lever/postings-api
import { fetchJson, htmlToText, log, mapLimit } from "../util.mjs";

const INTERVAL = { "per-year-salary": "year", "per-month-salary": "month", "per-hour-wage": "hour" };

export async function fetchLeverBoard(token) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
  return (Array.isArray(data) ? data : []).map((p) => {
    const locs = [p.categories?.location, ...(p.categories?.allLocations || [])].filter(Boolean).join(" / ");
    const lists = (p.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n");
    return {
      uid: `lever:${token}:${p.id}`,
      source: "Lever",
      company: token.charAt(0).toUpperCase() + token.slice(1),
      title: p.text || "",
      location: locs,
      isRemote: p.workplaceType === "remote" || /remote/i.test(locs),
      country: p.country || null,
      url: p.hostedUrl,
      applyUrl: p.applyUrl || (p.hostedUrl ? `${p.hostedUrl}/apply` : null),
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      salary: p.salaryRange
        ? { min: p.salaryRange.min, max: p.salaryRange.max, currency: p.salaryRange.currency, interval: INTERVAL[p.salaryRange.interval] || "year" }
        : null,
      description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n")
    };
  });
}

export async function fetchLever(tokens) {
  const results = await mapLimit(tokens, 6, async (t) => {
    try { const jobs = await fetchLeverBoard(t); if (tokens.length <= 60) log(`Lever ${t}: ${jobs.length}`); return jobs; }
    catch (err) { log(`⚠ Lever ${t} skipped: ${err.message}`); return []; }
  });
  const all = results.flat();
  log(`Lever: ${all.length} postings from ${tokens.length} boards`);
  return all;
}
