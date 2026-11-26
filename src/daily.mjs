// Daily run: fetch → filter → read JDs with the LLM → filter again → mail → remember what was sent.
//   node src/daily.mjs            (sends the mail)
//   node src/daily.mjs --dry-run  (writes out/daily.html instead, and does NOT mark jobs as seen)
// Exit codes: 0 ok, 1 crashed, 2 finished but failed the health check (see health.mjs).
import config from "../config.mjs";
import { loadEnv, istDate, log, logError, logCrashes, warnings } from "./util.mjs";
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
import { healthProblems, UNHEALTHY_EXIT } from "./health.mjs";

loadEnv();
logCrashes("daily");
const dryRun = process.argv.includes("--dry-run");
const today = istDate();
const started = Date.now();
// Milliseconds since the previous call: the duration of the stage that just ended.
let lapStart = started;
const lap = () => { const now = Date.now(); const ms = now - lapStart; lapStart = now; return ms; };

log(`Job Radar daily run for ${today}${dryRun ? " (dry run)" : ""}`, { event: "run_start", run: "daily", date: today, dry_run: dryRun });

const boards = allBoards(config);
const boardCounts = Object.fromEntries(Object.entries(boards).map(([p, t]) => [p, t.length]));
log("Boards loaded", { event: "boards", counts: boardCounts });
const results = await Promise.all([
  fetchAdzuna(config.adzuna, config.filters.minLpa),
  fetchGreenhouse(boards.greenhouse || []),
  fetchLever(boards.lever || []),
  fetchAshby(boards.ashby || []),
  fetchSmartRecruiters(boards.smartrecruiters || [])
]);
const all = results.flat();
const bySource = all.reduce((m, j) => ((m[j.source] = (m[j.source] || 0) + 1), m), {});
log(`Fetched ${all.length} postings`, { event: "fetch", fetched: all.length, by_source: bySource, duration_ms: lap() });

const seen = loadSeen();
const pre = preFilter(all, config.filters, config.toInr, seen);
log(`After cheap filters: ${pre.kept.length}`, { event: "prefilter", kept: pre.kept.length, dropped: pre.dropped, duration_ms: lap() });

// Clear software titles in India first, then remote, so the LLM quota is spent where it matters most.
const rank = (j) => (SOFTWARE_TITLE.test(j.title) ? 0 : 2) + (j.where === "india" ? 0 : 1);
pre.kept.sort((a, b) => rank(a) - rank(b));

await fillSmartRecruitersDetails(pre.kept);
log("Fetched missing descriptions", { event: "details", duration_ms: lap() });
const { enriched: read, total: toRead, ...llm } = await enrichJobs(pre.kept, config.llm);
for (const j of pre.kept) if (j.enriched) j.enriched.skills = [...new Set(j.enriched.skills.map(canonical))];
log(`Read ${read} of ${toRead} descriptions`, { event: "enrich", to_read: toRead, read, ...llm, duration_ms: lap() });

const post = postFilter(pre.kept, config.filters);
log(`After reading descriptions: ${post.kept.length}`, { event: "postfilter", kept: post.kept.length, dropped: post.dropped, duration_ms: lap() });

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
log("Digest delivered", { event: "mail", dry_run: dryRun, jobs: post.kept.length, duration_ms: lap() });

if (!dryRun) {
  saveDay(today, post.kept);
  // Remember everything we examined in depth (sent or dropped after reading), so it's never processed twice.
  saveSeen(seen, pre.kept.map((j) => j.uid), config.keepHistoryDays);
  log("Saved data/seen.json and today's jobs", { event: "save", duration_ms: lap() });
}

// Checked last, so the mail has gone out and the state is saved even when the run is unhealthy.
const problems = healthProblems({ fetched: all.length, toRead, read, hasKey: Boolean(process.env.GROQ_API_KEY), dryRun });
for (const problem of problems) logError(`Health check failed: ${problem}`, { event: "health", run: "daily" });
if (problems.length) process.exitCode = UNHEALTHY_EXIT;
log("Run finished", {
  event: "run_end",
  run: "daily",
  status: problems.length ? "unhealthy" : "ok",
  problems,
  counts: { fetched: all.length, after_prefilter: pre.kept.length, read, mailed: post.kept.length },
  llm_calls: llm.llm_calls,
  llm_failures: llm.llm_failures,
  warnings: warnings(),
  duration_ms: Date.now() - started
});
