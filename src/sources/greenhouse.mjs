// Greenhouse public job board API. Docs: https://developers.greenhouse.io/job-board.html
import { fetchJson, htmlToText, log, mapLimit } from "../util.mjs";

export async function fetchGreenhouseBoard(token) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  const company = data.jobs?.[0]?.company_name || token;
  return (data.jobs || []).map((j) => ({
    uid: `greenhouse:${token}:${j.id}`,
    source: "Greenhouse",
    company: j.company_name || company,
    title: j.title || "",
    location: j.location?.name || "",
    isRemote: /remote/i.test(j.location?.name || ""),
    country: null,
    url: j.absolute_url,
    postedAt: j.first_published || j.updated_at,
    salary: null, // not exposed by the public API; the LLM looks for pay in the description
    description: htmlToText(j.content || "")
  }));
}

export async function fetchGreenhouse(tokens) {
  const results = await mapLimit(tokens, 6, async (t) => {
    try { const jobs = await fetchGreenhouseBoard(t); if (tokens.length <= 60) log(`Greenhouse ${t}: ${jobs.length}`); return jobs; }
    catch (err) { log(`⚠ Greenhouse ${t} skipped: ${err.message}`); return []; }
  });
  const all = results.flat();
  log(`Greenhouse: ${all.length} postings from ${tokens.length} boards`);
  return all;
}
