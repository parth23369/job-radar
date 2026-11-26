// Reads each job description with an LLM and extracts structured facts.
// Jobs are sent in small batches to stay inside the free tier's per-minute limits.
import { sleep, log } from "./util.mjs";
import { LEVELS, REMOTE_VERDICTS, validateResults } from "./validate.mjs";

const SYSTEM = `You extract structured facts from job postings for a job-market tracker.
For each job, return exactly one object in "jobs" with the same "id".
- level: "intern", "entry" (new grad / 0-2 yrs / SDE 1 / SWE I), "mid" (2-5 yrs / SDE 2 / SWE II), "senior" (5+ yrs, senior/staff/lead scope), or "unknown".
- yoe_min: minimum years of experience required as a number, or null if not stated.
- skills: up to 12 concrete technical skills, tools or domains REQUIRED or strongly preferred, using short canonical names ("Python", "C++", "Kubernetes", "AWS", "System design", "Distributed systems", "SQL", "React", "PyTorch", "LLMs"). No soft skills.
- remote_open_to_india: for remote roles, "yes" if candidates in India are eligible, "no" if restricted to other countries/timezones/work authorisation, "unclear" otherwise. For non-remote roles use "unclear".
- pay_lpa_min / pay_lpa_max: annual pay in Indian rupees lakh per annum ONLY if the posting states a number (convert if needed); otherwise null.
- tech_role: true if this is a software, data, ML/AI, embedded/firmware, systems, security or research-engineering role; false for sales, support, marketing, communications, operations, recruiting, IT/AV, facilities or hardware-only roles.
- summary: one short sentence on what the role does.
Use only what the posting says. Do not guess.`;

const TOOL = {
  type: "function",
  function: {
    name: "report_jobs",
    description: "Structured facts for each job.",
    parameters: {
      type: "object",
      properties: {
        jobs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              level: { type: "string", enum: LEVELS },
              yoe_min: { type: ["number", "null"] },
              skills: { type: "array", items: { type: "string" } },
              remote_open_to_india: { type: "string", enum: REMOTE_VERDICTS },
              pay_lpa_min: { type: ["number", "null"] },
              pay_lpa_max: { type: ["number", "null"] },
              tech_role: { type: "boolean" },
              summary: { type: "string" }
            },
            required: ["id", "level", "yoe_min", "skills", "remote_open_to_india", "pay_lpa_min", "pay_lpa_max", "tech_role", "summary"]
          }
        }
      },
      required: ["jobs"]
    }
  }
};

// Returns the decoded tool-call arguments, still unchecked.
async function callLlm(cfg, batch, stats) {
  const body = {
    model: cfg.model,
    temperature: 0,
    max_tokens: 4000,
    ...(cfg.model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: batch.map((j, i) =>
          `### id: ${i}\nTitle: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location}${j.isRemote ? " (remote)" : ""}\n\n${(j.description || "(no description)").slice(0, cfg.descriptionChars)}`
        ).join("\n\n---\n\n")
      }
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: "report_jobs" } }
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    stats.llm_calls++;
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 15000 * (attempt + 1);
      // A long wait means the DAILY free quota is used up, not the per-minute one. Don't sit there until the job times out.
      if (wait > 90_000) throw Object.assign(new Error(`daily LLM quota reached (retry in ${Math.round(wait / 60000)} min)`), { quota: true });
      stats.rate_limit_waits++;
      log(`  rate-limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const raw = msg?.tool_calls?.[0]?.function?.arguments ?? msg?.content;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  throw new Error("LLM still rate-limited after retries");
}

export async function enrichJobs(jobs, cfg) {
  const stats = { llm_calls: 0, llm_failures: 0, rate_limit_waits: 0, invalid_items: 0 };
  if (!process.env.GROQ_API_KEY) { log("⚠ Enrichment skipped: GROQ_API_KEY not set"); return { enriched: 0, total: jobs.length, stopped: "no key", ...stats }; }
  const todo = jobs.slice(0, cfg.maxJobsPerDay);
  if (jobs.length > todo.length) log(`Enriching first ${todo.length} of ${jobs.length} jobs (maxJobsPerDay)`);
  const deadline = Date.now() + (cfg.maxMinutes ?? 12) * 60_000;
  let stopped = null;

  for (let i = 0; i < todo.length; i += cfg.batchSize) {
    if (Date.now() > deadline) { stopped = `time budget of ${cfg.maxMinutes ?? 12} min used`; break; }
    const batch = todo.slice(i, i + cfg.batchSize);
    try {
      const { accepted, rejected } = validateResults(await callLlm(cfg, batch, stats), batch.length);
      for (const [position, facts] of accepted) batch[position].enriched = facts;
      stats.invalid_items += rejected.length;
      for (const r of rejected) log(`⚠ LLM item rejected: ${r.reason}`, { batch: i / cfg.batchSize + 1, id: r.id });
      log(`Enriched ${Math.min(i + cfg.batchSize, todo.length)}/${todo.length}`);
    } catch (err) {
      stats.llm_failures++;
      log(`⚠ Enrichment batch ${i / cfg.batchSize + 1} failed: ${err.message}`);
      if (err.quota) { stopped = err.message; break; }
    }
    if (i + cfg.batchSize < todo.length) await sleep(cfg.pauseMs);
  }
  const enriched = jobs.filter((j) => j.enriched).length;
  if (stopped) log(`⚠ Enrichment stopped early (${stopped}); remaining jobs are mailed without skills`);
  return { enriched, total: jobs.length, stopped, ...stats };
}
