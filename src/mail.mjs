import fs from "node:fs";
import nodemailer from "nodemailer";
import { log } from "./util.mjs";

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const C = { ink: "#18151F", muted: "#6B6680", rule: "#E6E3EE", accent: "#6D45E8", soft: "#F1EDFD", ok: "#127A4B", okSoft: "#E3F5EC", warn: "#9A5B00", warnSoft: "#FFF3DC" };
const pretty = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

function shell(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#F7F6FB;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.ink}">
<div style="max-width:680px;margin:0 auto;padding:24px 16px">
<h1 style="font-size:22px;margin:0 0 4px">${esc(title)}</h1>${inner}
<p style="color:${C.muted};font-size:12px;margin-top:28px">Sent by job-radar. Tune sources and filters in config.mjs.</p>
</div></body></html>`;
}

const chip = (text, bg = C.soft, fg = C.accent) =>
  `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;border-radius:999px;background:${bg};color:${fg};font-size:12px">${esc(text)}</span>`;

function payLabel(job) {
  if (!job.lpa) return chip("CTC not disclosed", "#EEEEF2", C.muted);
  const { min, max } = job.lpa;
  const range = Math.round(min) === Math.round(max) ? `₹${Math.round(min)} LPA` : `₹${Math.round(min)}–${Math.round(max)} LPA`;
  const note = job.salary?.predicted ? " (estimate)" : job.lpa.fromDescription ? " (from JD)" : "";
  return chip(range + note, C.okSoft, C.ok);
}

// Email-safe button: a one-cell table, because Gmail/Outlook ignore most CSS on plain links.
function applyButton(url) {
  return `<table role="presentation" align="right" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"><tr>
<td style="background:${C.accent};border-radius:8px">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:9px 18px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">Apply&nbsp;now&nbsp;&rarr;</a>
</td></tr></table>`;
}

function jobCard(job) {
  const e = job.enriched;
  const meta = [job.company, job.location || (job.where === "remote" ? "Remote" : ""), job.source].filter(Boolean).map(esc).join(" · ");
  const badges = [
    payLabel(job),
    e?.level && e.level !== "unknown" ? chip(e.level === "mid" ? "SDE 2 level" : e.level === "entry" ? "Entry level" : "Intern") : "",
    e?.yoe_min != null ? chip(`${e.yoe_min}+ yrs`) : "",
    job.where === "remote" && e?.remote_open_to_india === "unclear" ? chip("India eligibility unclear", C.warnSoft, C.warn) : ""
  ].join("");
  const skills = e?.skills?.length ? `<div style="margin-top:6px;font-size:13px;color:${C.muted}">Skills: ${e.skills.map(esc).join(", ")}</div>` : "";
  const summary = e?.summary ? `<div style="margin-top:4px;font-size:13px">${esc(e.summary)}</div>` : "";
  return `<div style="background:#fff;border:1px solid ${C.rule};border-radius:12px;padding:14px 16px;margin:10px 0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="vertical-align:top">
<a href="${esc(job.url)}" target="_blank" style="font-size:16px;font-weight:600;color:${C.ink};text-decoration:none">${esc(job.title)}</a>
<div style="font-size:13px;color:${C.muted};margin-top:2px">${meta}</div>
</td>
<td style="vertical-align:top;text-align:right;padding-left:12px;white-space:nowrap">${applyButton(job.applyUrl || job.url)}</td>
</tr></table>
<div style="margin-top:8px">${badges}</div>${summary}${skills}
<div style="margin-top:8px;font-size:12px"><a href="${esc(job.url)}" target="_blank" style="color:${C.accent}">Read the full description</a></div>
</div>`;
}

const byPayThenDate = (a, b) => (b.lpa?.max ?? -1) - (a.lpa?.max ?? -1) || new Date(b.postedAt || 0) - new Date(a.postedAt || 0);

export function renderDaily(date, jobs, stats) {
  const india = jobs.filter((j) => j.where === "india").sort(byPayThenDate);
  const remote = jobs.filter((j) => j.where === "remote").sort(byPayThenDate);
  const subject = `Job Radar · ${pretty(date)} · ${jobs.length} new role${jobs.length === 1 ? "" : "s"} (${india.length} India, ${remote.length} remote)`;

  const sources = Object.entries(stats.bySource).map(([s, n]) => `${s} ${n}`).join(" · ");
  const drops = Object.entries(stats.dropped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
  const intro = `<p style="color:${C.muted};font-size:13px;margin:0 0 16px">New since yesterday's mail. Scanned ${stats.scanned} postings (${esc(sources)}). Filtered out: ${esc(drops || "none")}.</p>`;

  const section = (title, list) => list.length
    ? `<h2 style="font-size:17px;margin:22px 0 4px">${title} <span style="color:${C.muted};font-weight:400">(${list.length})</span></h2>${list.map(jobCard).join("")}`
    : "";
  const body = jobs.length
    ? section("India", india) + section("Remote (international)", remote)
    : `<p>No new roles matched your filters today.</p>`;
  return { subject, html: shell(`Job Radar · ${pretty(date)}`, intro + body) };
}

export function renderWeekly(range, jobs, mySkills) {
  const n = jobs.length;
  const pct = (x) => (n ? Math.round((100 * x) / n) : 0);
  const count = (arr) => Object.entries(arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

  const skills = count(jobs.flatMap((j) => [...new Set(j.enriched?.skills || [])]));
  const gaps = skills.filter(([s]) => !mySkills.has(s.toLowerCase())).slice(0, 10);
  const levels = count(jobs.map((j) => j.enriched?.level || "unknown"));
  const companies = count(jobs.map((j) => j.company)).slice(0, 10);
  const perDay = count(jobs.map((j) => j.day)).sort((a, b) => a[0].localeCompare(b[0]));
  const paid = jobs.filter((j) => j.lpa).map((j) => (j.lpa.min + j.lpa.max) / 2).sort((a, b) => a - b);
  const median = paid.length ? Math.round(paid[Math.floor(paid.length / 2)]) : null;
  const india = jobs.filter((j) => j.where === "india").length;

  const row = (cells, head = false) => `<tr>${cells.map((c, i) =>
    `<${head ? "th" : "td"} style="text-align:${i ? "right" : "left"};padding:6px 8px;border-bottom:1px solid ${C.rule};font-size:13px${head ? `;color:${C.muted};font-weight:600` : ""}">${c}</${head ? "th" : "td"}>`).join("")}</tr>`;
  const table = (head, rows) => `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.rule};border-radius:12px">${row(head, true)}${rows.join("")}</table>`;
  const h2 = (t) => `<h2 style="font-size:17px;margin:24px 0 8px">${t}</h2>`;

  const levelName = { intern: "Intern", entry: "Entry level", mid: "SDE 2 level", senior: "Senior", unknown: "Not stated" };
  const html = shell(`Weekly job-market report · ${pretty(range[0])} – ${pretty(range[1])}`, `
<p style="color:${C.muted};font-size:14px;margin:0 0 8px"><b style="color:${C.ink}">${n}</b> non-senior tech roles reached your inbox this week: ${india} in India, ${n - india} remote. ${median ? `Median disclosed pay: <b style="color:${C.ink}">₹${median} LPA</b> (${paid.length} of ${n} disclosed).` : "Almost no postings disclosed pay."}</p>
${h2("What to study next: most requested skills not on your site")}
${gaps.length ? `<p style="font-size:14px;margin:0">${gaps.map(([s, c]) => chip(`${s} · ${pct(c)}%`, C.warnSoft, C.warn)).join(" ")}</p>` : "<p>Every frequently requested skill already appears on your site.</p>"}
${h2("Top 20 requested skills")}
${table(["Skill", "Roles", "Share", "On your site"], skills.slice(0, 20).map(([s, c]) => row([esc(s), c, `${pct(c)}%`, mySkills.has(s.toLowerCase()) ? `<span style="color:${C.ok}">✓ yes</span>` : `<span style="color:${C.warn}">gap</span>`])))}
${h2("Seniority mix")}
${table(["Level", "Roles", "Share"], levels.map(([l, c]) => row([levelName[l] || l, c, `${pct(c)}%`])))}
${h2("Companies posting the most")}
${table(["Company", "Roles"], companies.map(([co, c]) => row([esc(co), c])))}
${h2("Roles per day")}
${table(["Day", "Roles"], perDay.map(([d, c]) => row([pretty(d), c])))}`);

  return { subject: `Weekly job-market report · ${pretty(range[0])} – ${pretty(range[1])} · ${n} roles`, html };
}

export async function sendMail({ subject, html }, { dryRun, tag }) {
  if (dryRun) {
    fs.mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
    const file = new URL(`../out/${tag}.html`, import.meta.url);
    fs.writeFileSync(file, html);
    log(`[dry run] "${subject}" written to out/${tag}.html`);
    return;
  }
  const { GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not set");
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  await transport.sendMail({ from: `Job Radar <${GMAIL_USER}>`, to: MAIL_TO || GMAIL_USER, subject, html });
  log(`Mail sent: "${subject}"`);
}
