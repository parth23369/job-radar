// Daily run: fetch → filter → read JDs with the LLM → filter again → mail → remember what was sent.
//   node src/daily.mjs            (sends the mail)
//   node src/daily.mjs --dry-run  (writes out/daily.html instead, and does NOT mark jobs as seen)
import config from "../config.mjs";
import { loadEnv, istDate, log } from "./util.mjs";
import { fetchAdzuna } from "./sources/adzuna.mjs";
import { fetchGreenhouse } from "./sources/greenhouse.mjs";
import { fetchLever } from "./sources/lever.mjs";
import { fetchAshby } from "./sources/ashby.mjs";
import { fetchSmartRecruiters, fillSmartRecruitersDetails } from "./sources/smartrecruiters.mjs";
import { preFilter, postFilter, SOFTWARE_TITLE } from "./filters.mjs";
import { enrichJobs } from "./enrich.mjs";
import { canonical } from "./skills.mjs";
import { loadSeen, saveSeen, saveDay } from "./store.mjs";
import { renderDaily, sendMail } from "./mail.mjs";
import { allBoards } from "./boards.mjs";

loadEnv();
const dryRun = process.argv.includes("--dry-run");
const today = istDate();
log(`Job Radar daily run for ${today}${dryRun ? " (dry run)" : ""}`);

const boards = allBoards(config);
log(`Boards: ${Object.entries(boards).map(([p, t]) => `${p} ${t.length}`).join(", ")}`);
const results = await Promise.all([
  fetchAdzuna(config.adzuna, config.filters.minLpa),
  fetchGreenhouse(boards.greenhouse || []),
  fetchLever(boards.lever || []),
  fetchAshby(boards.ashby || []),
  fetchSmartRecruiters(boards.smartrecruiters || [])
]);
const all = results.flat();
const bySource = all.reduce((m, j) => ((m[j.source] = (m[j.source] || 0) + 1), m), {});
log(`Fetched ${all.length} postings`, bySource);

const seen = loadSeen();
const pre = preFilter(all, config.filters, config.toInr, seen);
log(`After cheap filters: ${pre.kept.length}`, pre.dropped);

// Clear software titles in India first, then remote, so the LLM quota is spent where it matters most.
const rank = (j) => (SOFTWARE_TITLE.test(j.title) ? 0 : 2) + (j.where === "india" ? 0 : 1);
pre.kept.sort((a, b) => rank(a) - rank(b));

await fillSmartRecruitersDetails(pre.kept);
await enrichJobs(pre.kept, config.llm);
for (const j of pre.kept) if (j.enriched) j.enriched.skills = [...new Set(j.enriched.skills.map(canonical))];

const post = postFilter(pre.kept, config.filters);
log(`After reading descriptions: ${post.kept.length}`, post.dropped);

const dropped = {
  duplicate: pre.dropped.duplicate,
  "non-tech": pre.dropped.notTech + post.dropped.notTech,
  "excluded company": pre.dropped.excludedCompany,
  senior: pre.dropped.senior + post.dropped.senior,
  "on-site abroad": pre.dropped.location,
  "not open to India": post.dropped.notEligibleFromIndia,
  old: pre.dropped.old,
  [`below ₹${config.filters.minLpa} LPA`]: pre.dropped.lowPay + post.dropped.lowPay
};
const mail = renderDaily(today, post.kept, { scanned: all.length, bySource, dropped });
await sendMail(mail, { dryRun, tag: "daily" });

if (!dryRun) {
  saveDay(today, post.kept);
  // Remember everything we examined in depth (sent or dropped after reading), so it's never processed twice.
  saveSeen(seen, pre.kept.map((j) => j.uid), config.keepHistoryDays);
  log("Saved data/seen.json and today's jobs");
}
