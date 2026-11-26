// The Groq call, with fetch replaced by a fake. No key and no network are needed.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import config from "../config.mjs";
import { enrichJobs } from "../src/enrich.mjs";

const cfg = { ...config.llm, batchSize: 1, pauseMs: 0, maxJobsPerDay: 10 };
const realFetch = globalThis.fetch;
const realKey = process.env.GROQ_API_KEY;
beforeEach(() => { process.env.GROQ_API_KEY = "fake-key"; });
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = realKey;
});

const jobs = (n) => Array.from({ length: n }, (_, i) => ({ title: `Engineer ${i}`, company: "Acme", location: "Pune", description: "Python" }));
const facts = { id: "0", level: "entry", yoe_min: 1, skills: ["Python"], remote_open_to_india: "unclear", pay_lpa_min: null, pay_lpa_max: null, tech_role: true, summary: "s" };
const reply = (items) => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ jobs: items }) } }] } }] }));
// Answers each call with the next response in the list, and records the requests.
function fakeGroq(...responses) {
  const requests = [];
  globalThis.fetch = async (url, opts) => { requests.push({ url, opts }); return responses.shift(); };
  return requests;
}

test("forces the tool call at temperature 0 and attaches the facts", async () => {
  const requests = fakeGroq(reply([facts]));
  const batch = jobs(1);
  const stats = await enrichJobs(batch, cfg);
  const body = JSON.parse(requests[0].opts.body);
  assert.equal(body.temperature, 0);
  assert.equal(body.tool_choice.function.name, "report_jobs");
  assert.equal(requests[0].opts.headers.Authorization, "Bearer fake-key");
  assert.deepEqual(batch[0].enriched, facts);
  assert.deepEqual([stats.enriched, stats.llm_calls, stats.llm_failures, stats.invalid_items], [1, 1, 0, 0]);
});

test("counts failed batches and rejected items, and carries on", async () => {
  fakeGroq(new Response("server error", { status: 500 }), reply([{ ...facts, level: "guru" }]), reply([facts]));
  const batch = jobs(3);
  const stats = await enrichJobs(batch, cfg);
  assert.deepEqual(batch.map((j) => Boolean(j.enriched)), [false, false, true]);
  assert.deepEqual([stats.enriched, stats.llm_calls, stats.llm_failures, stats.invalid_items], [1, 3, 1, 1]);
});

test("waits and retries when rate-limited, and stops when the daily quota is gone", async () => {
  const limited = (seconds) => new Response("", { status: 429, headers: { "retry-after": seconds } });
  fakeGroq(limited("0.001"), reply([facts]), limited("3600"));
  const batch = jobs(3);
  const stats = await enrichJobs(batch, cfg);
  assert.deepEqual([stats.enriched, stats.llm_calls, stats.rate_limit_waits, stats.llm_failures], [1, 3, 1, 1]);
  assert.match(stats.stopped, /daily LLM quota/);
});

test("makes no call without a key", async () => {
  delete process.env.GROQ_API_KEY;
  const requests = fakeGroq();
  const stats = await enrichJobs(jobs(2), cfg);
  assert.equal(requests.length, 0);
  assert.deepEqual([stats.enriched, stats.llm_calls, stats.stopped], [0, 0, "no key"]);
});
