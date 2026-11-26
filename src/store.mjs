// Plain JSON files in data/, committed back to the repo by the GitHub Action.
// data/seen.json         – every job id already reported (for de-duplication)
// data/jobs/<date>.json  – the jobs that went into that day's mail (for the weekly report)
import fs from "node:fs";

const DATA = new URL("../data/", import.meta.url);
const JOBS = new URL("jobs/", DATA);
const SEEN = new URL("seen.json", DATA);

export function loadSeen() {
  try { return JSON.parse(fs.readFileSync(SEEN, "utf8")); } catch { return {}; }
}

// A copy of `seen` with the new ids added and ids older than keepDays forgotten.
export function mergeSeen(seen, newIds, keepDays, now = new Date()) {
  const merged = { ...seen };
  for (const id of newIds) merged[id] = now.toISOString();
  const cutoff = now.getTime() - keepDays * 86_400_000;
  for (const [id, t] of Object.entries(merged)) if (new Date(t).getTime() < cutoff) delete merged[id];
  return merged;
}

export function saveSeen(seen, newIds, keepDays) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SEEN, JSON.stringify(mergeSeen(seen, newIds, keepDays), null, 0));
}

export function saveDay(date, jobs) {
  fs.mkdirSync(JOBS, { recursive: true });
  const slim = jobs.map(({ description, ...rest }) => rest); // descriptions are long; the mail doesn't need them later
  fs.writeFileSync(new URL(`${date}.json`, JOBS), JSON.stringify(slim, null, 1));
}

export function loadDays(dates) {
  const out = [];
  for (const d of dates) {
    try { out.push(...JSON.parse(fs.readFileSync(new URL(`${d}.json`, JOBS), "utf8")).map((j) => ({ ...j, day: d }))); }
    catch { /* no mail that day */ }
  }
  return out;
}
