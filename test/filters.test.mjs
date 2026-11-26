// Keyword, seniority, pay and region rules.
import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.mjs";
import { preFilter, postFilter, locationClass, plainRemote } from "../src/filters.mjs";

// The keyword lists come from config.mjs; the thresholds are pinned so that tuning them doesn't fail the tests.
const F = { ...config.filters, minLpa: 10, maxYearsExperience: 3, keepUnknownSalary: true, maxPostedAgeDays: 3, excludeCompanies: ["Staffing Co"] };
const toInr = { INR: 1, USD: 85 };

const job = (over = {}) => ({ uid: "test:1", company: "Acme", title: "Software Engineer", location: "Bengaluru, India", isRemote: false, country: null, ...over });
// "kept", or the name of the rule that dropped the job.
const verdict = ({ kept, dropped }) => (kept.length ? "kept" : Object.entries(dropped).find(([, n]) => n)[0]);
const pre = (over, filters = F) => verdict(preFilter([job(over)], filters, toInr, {}));
const post = (over) => verdict(postFilter([{ ...job(), where: "india", ...over }], F));
const where = (location, over = {}) => locationClass(job({ location, isRemote: true, ...over }));

// ── Keywords and seniority ───────────────────────────────────
test("keeps entry and mid level engineering titles", () => {
  for (const title of ["Software Engineer", "SDE 1", "SDE II", "Software Engineer II", "Backend Developer", "Data Scientist", "Graduate Engineer Trainee"]) {
    assert.equal(pre({ title }), "kept", title);
  }
});

test("drops titles that are not tech roles", () => {
  for (const title of ["Office Coordinator", "Sales Engineer", "Civil Engineer", "Recruiting Coordinator, Engineering"]) {
    assert.notEqual(pre({ title }), "kept", title);
  }
  assert.equal(pre({ title: "Office Coordinator" }), "notTech");
});

test("drops seniority words", () => {
  for (const title of ["Senior Software Engineer", "Sr. Backend Developer", "Staff Engineer", "Lead Data Engineer", "Principal Engineer", "Software Engineering Manager", "Software Architect"]) {
    assert.equal(pre({ title }), "senior", title);
  }
});

test("drops high level numbers but keeps level 2", () => {
  for (const title of ["Software Engineer III", "SDE-3", "Software Engineer 4", "Developer, V"]) assert.equal(pre({ title }), "senior", title);
  for (const title of ["SDE-2", "Software Engineer 2"]) assert.equal(pre({ title }), "kept", title);
});

test("matches keywords as whole words only", () => {
  assert.equal(pre({ title: "Software Engineer, Internal Tools" }), "kept");
  assert.equal(pre({ title: "Chennai Office Coordinator" }), "notTech"); // contains "ai", but not the word
});

test("after reading: at most 3 years of experience, and nothing the LLM calls senior", () => {
  const read = (level, yoe_min) => post({ enriched: { level, yoe_min, tech_role: true, pay_lpa_min: null } });
  assert.equal(read("mid", 3), "kept");
  assert.equal(read("mid", 4), "senior");
  assert.equal(read("senior", null), "senior");
  assert.equal(read("unknown", null), "kept");
});

test("applies the pay floor to the bottom of a known range", () => {
  const salary = (min, max, currency = "INR", interval = "year") => ({ salary: { min, max, currency, interval } });
  assert.equal(pre(salary(900_000, 2_000_000)), "lowPay");
  assert.equal(pre(salary(1_000_000, 1_500_000)), "kept");
  assert.equal(pre(salary(5_000, 6_000, "USD", "month")), "kept"); // about 51 LPA
  assert.equal(pre({ salary: null }), "kept");
  assert.equal(pre({ salary: null }, { ...F, keepUnknownSalary: false }), "lowPay");
});

// ── Regions ──────────────────────────────────────────────────
test("recognises India by city name or country code", () => {
  assert.equal(locationClass(job({ location: "Gurugram" })), "india");
  assert.equal(locationClass(job({ location: "Office 4", country: "IN" })), "india");
});

test("drops on-site jobs outside India", () => {
  assert.equal(locationClass(job({ location: "San Francisco, CA" })), null);
  assert.equal(pre({ location: "London" }), "location");
});

test("treats unrestricted remote jobs as remote", () => {
  for (const location of ["Remote", "Remote - Worldwide", "Anywhere"]) assert.equal(where(location), "remote", location);
});

test("drops remote jobs restricted to other regions, including restrictions in the title", () => {
  for (const location of ["Remote (US)", "Remote - Europe", "Remote, EST time zone", "Remote - Pacific Time"]) assert.equal(where(location), null, location);
  assert.equal(where("Remote", { title: "Data Engineer - US Remote" }), null);
});

test("drops hybrid abroad, and keeps a wide region that overrides a narrow one", () => {
  assert.equal(where("Hybrid - Berlin"), null);
  assert.equal(where("Remote - APAC or US"), "remote");
});

test("plainRemote is true only when no city or country is named", () => {
  assert.equal(plainRemote("Remote - Worldwide"), true);
  assert.equal(plainRemote("Remote, Toronto"), false);
});

test("after reading: remote jobs must be open to India", () => {
  const remote = (verdictText, location) => post({ where: "remote", location, enriched: { level: "entry", tech_role: true, remote_open_to_india: verdictText } });
  assert.equal(remote("yes", "Remote - Somewhere"), "kept");
  assert.equal(remote("no", "Remote"), "notEligibleFromIndia");
  assert.equal(remote("unclear", "Remote"), "kept");
  assert.equal(remote("unclear", "Remote - Somewhere"), "notEligibleFromIndia");
});

// ── Regressions ──────────────────────────────────────────────
test("regression: 'Join us' is not read as the United States", () => {
  assert.equal(where("Remote", { title: "Software Engineer - Join us" }), "remote");
  assert.equal(where("Remote", { title: "Join Us as a Backend Developer" }), "remote");
  // Real US restrictions still apply.
  assert.equal(where("Remote", { title: "Join US Engineering" }), null);
  assert.equal(where("Remote", { title: "Join our US-based team, Developer" }), null);
  assert.equal(where("Remote", { title: "Join us - US Remote Developer" }), null);
  assert.equal(where("Remote (US)", { title: "Software Engineer - Join us" }), null);
});

test("regression: an engineer on a Finance Platform team is not dropped", () => {
  assert.equal(pre({ title: "Software Engineer, Finance Platform" }), "kept");
  assert.equal(pre({ title: "SDE II - Finance Platform" }), "kept");
  // The rule is otherwise unchanged.
  assert.equal(pre({ title: "Senior Software Engineer, Finance Platform" }), "senior");
  assert.equal(pre({ title: "Software Engineer, Finance" }), "senior");
  assert.equal(pre({ title: "Finance Platform Analyst" }), "senior");
});
