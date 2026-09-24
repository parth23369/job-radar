// Offline end-to-end test: every API (Adzuna, Greenhouse, Lever, Ashby, SmartRecruiters, Groq)
// is replaced with a fake that returns realistic sample data. Nothing is sent or saved.
//   node test/mock-run.mjs
const now = Date.now();
const iso = (hoursAgo) => new Date(now - hoursAgo * 3_600_000).toISOString();

const fixtures = {
  adzuna: {
    results: [
      { id: "a1", title: "Software Engineer - Backend", company: { display_name: "Acme Fintech" }, location: { display_name: "Bengaluru, Karnataka" }, redirect_url: "https://example.com/a1", created: iso(10), description: "Build payment APIs in Java and Spring. 1-3 years experience. Kafka, PostgreSQL, AWS.", salary_min: 1400000, salary_max: 2000000, salary_is_predicted: "0" },
      { id: "a2", title: "Senior Software Engineer", company: { display_name: "BigCo" }, location: { display_name: "Pune" }, redirect_url: "https://example.com/a2", created: iso(5), description: "8+ years.", salary_min: 3500000, salary_max: 4500000, salary_is_predicted: "0" },
      { id: "a3", title: "SDE 1", company: { display_name: "Cheap Startup" }, location: { display_name: "Noida" }, redirect_url: "https://example.com/a3", created: iso(3), description: "C++ and DSA.", salary_min: 500000, salary_max: 700000, salary_is_predicted: "1" }
    ]
  },
  greenhouse: {
    jobs: [
      { id: 101, title: "Software Engineer II, Platform", company_name: "Databricks", location: { name: "Bengaluru, India" }, absolute_url: "https://example.com/g101", first_published: iso(20), updated_at: iso(20), content: "&lt;p&gt;Distributed systems in Scala and Go. 2+ years. Kubernetes, AWS.&lt;/p&gt;" },
      { id: 102, title: "Staff Engineer", company_name: "Databricks", location: { name: "Bengaluru, India" }, absolute_url: "https://example.com/g102", first_published: iso(20), content: "" },
      { id: 103, title: "Software Engineer", company_name: "Databricks", location: { name: "San Francisco, CA" }, absolute_url: "https://example.com/g103", first_published: iso(20), content: "" },
      { id: 104, title: "Account Executive", company_name: "Databricks", location: { name: "Mumbai, India" }, absolute_url: "https://example.com/g104", first_published: iso(20), content: "" },
      { id: 105, title: "Software Engineer, New Grad", company_name: "Databricks", location: { name: "Bengaluru" }, absolute_url: "https://example.com/g105", first_published: iso(24 * 9), content: "old posting" }
    ]
  },
  lever: [
    { id: "l1", text: "Backend Engineer", categories: { location: "Bangalore", commitment: "Full-time" }, workplaceType: "onsite", country: "IN", hostedUrl: "https://example.com/l1", createdAt: now - 6 * 3_600_000, descriptionPlain: "Python, FastAPI, PostgreSQL. 0-2 years.", lists: [{ text: "Requirements", content: "<li>Python</li><li>SQL</li>" }] }
  ],
  ashby: {
    jobs: [
      { id: "s1", title: "Software Engineer, Infrastructure", location: "Remote", isRemote: true, isListed: true, jobUrl: "https://example.com/s1", publishedAt: iso(12), descriptionPlain: "Remote, open worldwide. Rust, Linux, Kubernetes. 2+ years.", compensation: { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 90000, maxValue: 130000 }] } },
      { id: "s2", title: "Software Engineer", location: "Remote (US)", isRemote: true, isListed: true, jobUrl: "https://example.com/s2", publishedAt: iso(12), descriptionPlain: "Must be authorized to work in the US. TypeScript, React." }
    ]
  },
  smartrecruitersList: { content: [{ id: "v1", name: "Software Engineer (C++, Embedded)", releasedDate: iso(30), location: { city: "Bangalore", country: "in", remote: false }, company: { name: "Visa" } }] },
  smartrecruitersDetail: { jobAd: { sections: { jobDescription: { text: "<p>Embedded C++ on Linux, RTOS, 1-3 years.</p>" }, qualifications: { text: "<ul><li>C++</li><li>Linux</li></ul>" } } } }
};

// Fake Groq: reads the batch and returns plausible facts, keyed by the ids it was given.
function fakeLlm(body) {
  const user = body.messages.find((m) => m.role === "user").content;
  const blocks = user.split("\n\n---\n\n");
  const jobs = blocks.map((b) => {
    const id = b.match(/### id: (\d+)/)[1];
    const title = b.match(/Title: (.*)/)[1];
    const text = b.toLowerCase();
    const us = text.includes("authorized to work in the us");
    return {
      id, level: /ii\b/i.test(title) ? "mid" : "entry", yoe_min: /2\+/.test(text) ? 2 : 1,
      skills: ["python", "sql", "kubernetes", "aws", "c++", "linux", "golang", "rust"].filter((s) => text.includes(s === "golang" ? " go" : s)),
      remote_open_to_india: us ? "no" : text.includes("worldwide") ? "yes" : "unclear",
      pay_lpa_min: null, pay_lpa_max: null, summary: `Works on ${title.toLowerCase()} problems.`
    };
  });
  return { choices: [{ message: { tool_calls: [{ function: { name: "report_jobs", arguments: JSON.stringify({ jobs }) } }] } }] };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("api.adzuna.com")) return json(fixtures.adzuna);
  if (u.includes("boards-api.greenhouse.io/v1/boards/databricks")) return json(fixtures.greenhouse);
  if (u.includes("boards-api.greenhouse.io")) return json({ jobs: [] });
  if (u.includes("api.lever.co/v0/postings/meesho")) return json(fixtures.lever);
  if (u.includes("api.lever.co")) return new Response("not found", { status: 404 });
  if (u.includes("api.ashbyhq.com/posting-api/job-board/deel")) return json(fixtures.ashby);
  if (u.includes("api.ashbyhq.com")) return json({ jobs: [] });
  if (u.match(/smartrecruiters\.com\/v1\/companies\/Visa\/postings\/v1/)) return json(fixtures.smartrecruitersDetail);
  if (u.includes("smartrecruiters.com/v1/companies/Visa/postings")) return json(u.includes("country=in") ? fixtures.smartrecruitersList : { content: [] });
  if (u.includes("smartrecruiters.com")) return json({ content: [] });
  if (u.includes("/chat/completions")) return json(fakeLlm(JSON.parse(opts.body)));
  if (u.includes("vercel.app")) return new Response("nope", { status: 404 });
  throw new Error("Unexpected URL in test: " + u);
};

process.env.ADZUNA_APP_ID = "test"; process.env.ADZUNA_APP_KEY = "test"; process.env.GROQ_API_KEY = "test";
process.argv.push("--dry-run");

// Make the LLM pause instant for the test.
const config = (await import("../config.mjs")).default;
config.llm.pauseMs = 0;
config.adzuna.queries = ["software engineer"]; // one query is enough for the test

await import("../src/daily.mjs");

// Weekly: feed it two fake days built from the same shape the daily run saves.
const { renderWeekly, sendMail } = await import("../src/mail.mjs");
const { istDate } = await import("../src/util.mjs");
const sample = [
  { title: "SDE 1", company: "Acme", where: "india", day: istDate(), lpa: { min: 14, max: 20 }, enriched: { level: "entry", skills: ["Python", "SQL", "AWS", "Kubernetes"] } },
  { title: "SWE II", company: "Databricks", where: "india", day: istDate(), lpa: null, enriched: { level: "mid", skills: ["Go", "Kubernetes", "AWS", "Distributed systems"] } },
  { title: "Infra Engineer", company: "Deel", where: "remote", day: istDate(new Date(now - 86_400_000)), lpa: { min: 76, max: 110 }, enriched: { level: "mid", skills: ["Rust", "Linux", "Kubernetes"] } }
];
const mySkills = new Set(["python", "sql", "linux", "c", "c++"]);
await sendMail(renderWeekly([istDate(new Date(now - 6 * 86_400_000)), istDate()], sample, mySkills), { dryRun: true, tag: "weekly" });
