import fs from "node:fs";

// Load .env for local runs (GitHub Actions passes secrets as real env vars).
export function loadEnv(path = new URL("../.env", import.meta.url)) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { retries = 2, timeoutMs = 20000, ...opts } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "job-radar/1.0", ...(opts.headers || {}) } });
      if (res.status === 404) { const e = new Error(`404 Not Found`); e.status = 404; throw e; }
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, retry: true });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
      return await res.json();
    } catch (err) {
      const retryable = err.retry || err.name === "AbortError" || err.cause;
      if (attempt >= retries || !retryable) throw err;
      await sleep(1500 * (attempt + 1) ** 2);
    } finally {
      clearTimeout(timer);
    }
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
export function decodeEntities(s = "") {
  return s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
export function htmlToText(html = "") {
  return decodeEntities(decodeEntities(html)) // Greenhouse double-encodes
    .replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Dates in Indian time, since the mails are for you.
export function istDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d); // YYYY-MM-DD
}
export function istWeekday(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }).format(d);
}
export const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

// Logs are one JSON object per line, so a run can be searched and counted.
// A message starting with ⚠ is logged as a warning. `data` adds fields to the line.
let warningCount = 0;
export const warnings = () => warningCount;

function write(level, msg, data = {}) {
  const entry = { ts: new Date().toISOString(), level, msg };
  for (const [key, value] of Object.entries(data)) if (!(key in entry)) entry[key] = value;
  (level === "error" ? console.error : console.log)(JSON.stringify(entry));
}

export function log(msg, data) {
  const isWarning = msg.startsWith("⚠");
  if (isWarning) warningCount++;
  write(isWarning ? "warn" : "info", msg.replace(/^⚠\s*/, "").trim(), data);
}

export const logError = (msg, data) => write("error", msg, data);

// A crash becomes one JSON line and exit code 1, instead of a bare stack trace.
export function logCrashes(run) {
  process.on("uncaughtException", (err) => {
    logError(`${run} run crashed`, { event: "run_crashed", run, error: err?.message ?? String(err), stack: err?.stack });
    process.exit(1);
  });
}

// Run an async function over items with at most `limit` running at once.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
