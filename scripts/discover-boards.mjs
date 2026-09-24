// Finds company job boards automatically.
//   npm run discover-boards            (checks every candidate; takes a few minutes)
//   npm run discover-boards -- --max 50  (quick trial on the first 50)
//
// 1. Downloads the public job lists in config.discovery.lists.
// 2. Pulls the board name out of every Greenhouse / Lever / Ashby / SmartRecruiters link.
// 3. Checks each board's live jobs and counts roles that pass your filters
//    (tech, not senior, in India or plain remote).
// 4. Saves boards with at least `minEligibleJobs` such roles to data/discovered-boards.json.
//    The daily run picks that file up automatically, alongside the boards in config.mjs.
import fs from "node:fs";
import config from "../config.mjs";
import { fetchJson, mapLimit } from "../src/util.mjs";
import { fetchGreenhouseBoard } from "../src/sources/greenhouse.mjs";
import { fetchLeverBoard } from "../src/sources/lever.mjs";
import { fetchAshbyBoard } from "../src/sources/ashby.mjs";
import { fetchSmartRecruitersBoard } from "../src/sources/smartrecruiters.mjs";
import { preFilter, plainRemote } from "../src/filters.mjs";

const maxArg = process.argv.indexOf("--max");
const MAX = maxArg > -1 ? Number(process.argv[maxArg + 1]) : Infinity;

const PATTERNS = {
  greenhouse: [/(?:boards|job-boards)\.greenhouse\.io\/embed\/job_app\?for=([A-Za-z0-9_-]+)/, /(?:boards|job-boards)\.greenhouse\.io\/(?!embed\b)([A-Za-z0-9_-]+)/],
  lever: [/\/\/jobs\.lever\.co\/([A-Za-z0-9_.-]+)/],
  ashby: [/jobs\.ashbyhq\.com\/([^/?#]+)/],
  smartrecruiters: [/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/]
};
const FETCH = { greenhouse: fetchGreenhouseBoard, lever: fetchLeverBoard, ashby: fetchAshbyBoard, smartrecruiters: fetchSmartRecruitersBoard };

// 1–2. Collect candidate board names
const candidates = { greenhouse: new Set(), lever: new Set(), ashby: new Set(), smartrecruiters: new Set() };
for (const url of config.discovery.lists) {
  try {
    const listings = await fetchJson(url, { timeoutMs: 60000 });
    for (const item of listings) {
      for (const link of [item.url, item.company_url].filter(Boolean)) {
        for (const [platform, pats] of Object.entries(PATTERNS)) {
          for (const re of pats) {
            const m = link.match(re);
            if (m) { candidates[platform].add(decodeURIComponent(m[1])); break; }
          }
        }
      }
    }
    console.log(`✓ ${url.split("/")[4]}: ${listings.length} listings`);
  } catch (err) {
    console.log(`⚠ Couldn't read ${url}: ${err.message}`);
  }
}

const already = new Set(Object.values(config.boards).flat().map((t) => t.toLowerCase()));
const todo = Object.entries(candidates)
  .flatMap(([platform, set]) => [...set].filter((t) => !already.has(t.toLowerCase())).map((token) => ({ platform, token })))
  .slice(0, MAX);
console.log(`\nChecking ${todo.length} new candidate boards (skipping ${already.size} already in config.mjs)…`);

// 3. Check each board
const filters = { ...config.filters, maxPostedAgeDays: 1e6, keepUnknownSalary: true };
let done = 0;
const results = await mapLimit(todo, 8, async ({ platform, token }) => {
  let row = { platform, token, ok: false, total: 0, eligible: 0, india: 0, remote: 0 };
  try {
    const jobs = await FETCH[platform](token);
    const { kept } = preFilter(jobs, filters, config.toInr, {});
    const good = kept.filter((j) => j.where === "india" || plainRemote(j.location));
    row = { platform, token, ok: true, company: jobs[0]?.company || token, total: jobs.length, eligible: good.length,
            india: good.filter((j) => j.where === "india").length, remote: good.filter((j) => j.where === "remote").length };
  } catch { /* board gone or renamed */ }
  if (++done % 100 === 0) console.log(`  …${done}/${todo.length}`);
  return row;
});

// 4. Keep the useful ones
const keep = results.filter((r) => r.ok && r.eligible >= config.discovery.minEligibleJobs).sort((a, b) => b.eligible - a.eligible);
const boards = {};
for (const r of keep) (boards[r.platform] ||= []).push(r.token);

fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../data/discovered-boards.json", import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  minEligibleJobs: config.discovery.minEligibleJobs,
  boards,
  details: keep
}, null, 1));

const working = results.filter((r) => r.ok).length;
console.log(`\n${working} of ${todo.length} boards responded; ${keep.length} have ≥${config.discovery.minEligibleJobs} India/remote non-senior tech roles.`);
console.log(Object.entries(boards).map(([p, t]) => `  ${p}: ${t.length}`).join("\n"));
console.log("\nTop 30:");
for (const r of keep.slice(0, 30)) console.log(`  ${r.platform.padEnd(15)} ${r.token.padEnd(24)} ${String(r.eligible).padStart(3)} roles (${r.india} India, ${r.remote} remote)`);
console.log("\nSaved to data/discovered-boards.json. The daily run now includes these boards automatically.");
console.log("To exclude one, delete it from that file, or re-run this script with a higher minEligibleJobs.");
