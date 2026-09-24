import { daysAgo } from "./util.mjs";

const INDIA = /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|new delhi|gurgaon|gurugram|noida|chennai|kolkata|ahmedabad|kochi|jaipur|indore|chandigarh|coimbatore|thiruvananthapuram|trivandrum|mysuru|mysore)\b/i;
const FOREIGN_ONLY = /\b(us|usa|u\.s\.|united states|canada|uk|united kingdom|europe|emea|eu|amer|americas|north america|latam|germany|france|netherlands|ireland|spain|poland|brazil|mexico|australia|japan|singapore|[a-z]{2,} time ?zones?|est|pst|cet)\b/i;
const OPEN_WIDE = /\b(anywhere|worldwide|global|apac|asia)\b/i;
const SENIOR_LEVEL_NUMBER = /\b(engineer|developer|scientist|swe|sde)\s*[-,]?\s*(3|4|5|iii|iv|v)\b/i;
const PER_YEAR = { year: 1, month: 12, week: 52, day: 260, hour: 2080 };

// Whole-word match, so "ai" doesn't match "Chennai" and "intern" doesn't match "internal".
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (words) => new RegExp(`(?<![a-z0-9])(${words.map((w) => esc(w.trim().toLowerCase())).join("|")})(?![a-z0-9])`, "i");

// ₹ lakh per annum for a salary object, or null if unknown.
export function salaryLpa(salary, toInr) {
  if (!salary || (!salary.min && !salary.max)) return null;
  const rate = toInr[(salary.currency || "INR").toUpperCase()];
  if (!rate) return null; // unknown currency: treat as unknown rather than guess
  const k = rate * (PER_YEAR[salary.interval] || 1) / 100_000;
  const min = salary.min ? salary.min * k : null;
  const max = salary.max ? salary.max * k : null;
  return { min: min ?? max, max: max ?? min };
}

// "india" | "remote" | null (not eligible: on-site outside India, or remote restricted to other regions)
export function locationClass(job) {
  const text = `${job.location} ${job.country || ""}`;
  if (job.country === "IN" || INDIA.test(text)) return "india";
  if (job.isRemote) {
    if (FOREIGN_ONLY.test(job.location) && !OPEN_WIDE.test(job.location)) return null; // e.g. "Remote - US"
    return "remote";
  }
  return null;
}

// True when the location says nothing except remote/anywhere-style words (no city or country).
export function plainRemote(location = "") {
  return location.replace(/\b(remote|anywhere|worldwide|global|apac|asia|india|work from home|wfh)\b/gi, "").replace(/[^a-z]/gi, "") === "";
}

// Cheap filters that run before any LLM call.
export function preFilter(jobs, f, toInr, seen) {
  const kept = [];
  const dropped = { duplicate: 0, notTech: 0, senior: 0, location: 0, old: 0, lowPay: 0, excludedCompany: 0 };
  const inRun = new Set();
  const roleRe = wordRe(f.roleKeywords);
  const excludeRe = wordRe(f.titleExclude);
  const badCompanies = (f.excludeCompanies || []).map((c) => c.toLowerCase());

  for (const job of jobs) {
    if (seen[job.uid] || inRun.has(job.uid)) { dropped.duplicate++; continue; }
    inRun.add(job.uid);

    if (badCompanies.some((c) => job.company.toLowerCase().includes(c))) { dropped.excludedCompany++; continue; }
    if (!roleRe.test(job.title)) { dropped.notTech++; continue; }
    if (excludeRe.test(job.title) || SENIOR_LEVEL_NUMBER.test(job.title)) { dropped.senior++; continue; }

    const where = locationClass(job);
    if (!where) { dropped.location++; continue; }

    if (job.postedAt && daysAgo(job.postedAt) > f.maxPostedAgeDays) { dropped.old++; continue; }

    const lpa = salaryLpa(job.salary, toInr);
    if (lpa && lpa.min < f.minLpa) { dropped.lowPay++; continue; }   // the bottom of the range must clear the bar
    if (!lpa && !f.keepUnknownSalary) { dropped.lowPay++; continue; }

    kept.push({ ...job, where, lpa });
  }
  return { kept, dropped };
}

// Filters that need the LLM's reading of the description.
export function postFilter(jobs, f) {
  const kept = [];
  const dropped = { notTech: 0, senior: 0, notEligibleFromIndia: 0, lowPay: 0 };
  for (const job of jobs) {
    const e = job.enriched;

    if (e?.tech_role === false) { dropped.notTech++; continue; }
    if (e && (e.level === "senior" || (e.yoe_min != null && e.yoe_min > f.maxYearsExperience))) { dropped.senior++; continue; }

    // Remote roles: keep only if the LLM confirms India is eligible, or the location is plain "Remote"/"Anywhere".
    if (job.where === "remote") {
      const verdict = e?.remote_open_to_india;
      const ok = verdict === "yes" || (verdict !== "no" && plainRemote(job.location));
      if (!ok) { dropped.notEligibleFromIndia++; continue; }
    }

    if (e && !job.lpa && e.pay_lpa_min != null) {
      job.lpa = { min: e.pay_lpa_min, max: e.pay_lpa_max ?? e.pay_lpa_min, fromDescription: true };
      if (job.lpa.min < f.minLpa) { dropped.lowPay++; continue; }
    }
    kept.push(job);
  }
  return { kept, dropped };
}
