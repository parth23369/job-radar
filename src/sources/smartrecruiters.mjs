// SmartRecruiters public posting API. Docs: https://developers.smartrecruiters.com/docs/posting-api
// The list endpoint has no description, so details are fetched later, only for jobs that pass the filters.
import { fetchJson, htmlToText, log, mapLimit } from "../util.mjs";

export async function fetchSmartRecruitersBoard(token) {
  const jobs = [];
  for (const country of ["in", null]) { // India postings, then everything (to catch remote roles)
    const q = new URLSearchParams({ limit: "100", ...(country ? { country } : {}) });
    const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?${q}`);
    for (const p of data.content || []) {
      const loc = [p.location?.city, p.location?.region, (p.location?.country || "").toUpperCase()].filter(Boolean).join(", ");
      jobs.push({
        uid: `smartrecruiters:${token}:${p.id}`,
        source: "SmartRecruiters",
        company: p.company?.name || token,
        title: p.name || "",
        location: loc,
        isRemote: p.location?.remote === true,
        country: (p.location?.country || "").toUpperCase() || null,
        url: `https://jobs.smartrecruiters.com/${token}/${p.id}`,
        postedAt: p.releasedDate,
        salary: null,
        description: "",
        _detailUrl: `https://api.smartrecruiters.com/v1/companies/${token}/postings/${p.id}`
      });
    }
  }
  return jobs;
}

export async function fetchSmartRecruiters(tokens) {
  const results = await mapLimit(tokens, 6, async (t) => {
    try { const jobs = await fetchSmartRecruitersBoard(t); if (tokens.length <= 60) log(`SmartRecruiters ${t}: ${jobs.length}`); return jobs; }
    catch (err) { log(`⚠ SmartRecruiters ${t} skipped: ${err.message}`); return []; }
  });
  const all = results.flat();
  log(`SmartRecruiters: ${all.length} postings from ${tokens.length} boards`);
  return all;
}

// Called only for jobs that survived filtering.
export async function fillSmartRecruitersDetails(jobs) {
  for (const j of jobs.filter((x) => x._detailUrl && !x.description)) {
    try {
      const d = await fetchJson(j._detailUrl);
      const s = d.jobAd?.sections || {};
      j.description = htmlToText([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join("\n"));
    } catch (err) {
      log(`⚠ SmartRecruiters details failed for ${j.title}: ${err.message}`);
    }
    delete j._detailUrl;
  }
}
