// A job must never be mailed twice.
import test from "node:test";
import assert from "node:assert/strict";
import config from "../config.mjs";
import { preFilter } from "../src/filters.mjs";
import { mergeSeen } from "../src/store.mjs";
import { allBoards } from "../src/boards.mjs";

const job = (uid) => ({ uid, company: "Acme", title: "Software Engineer", location: "Pune", isRemote: false });
const run = (jobs, seen = {}) => preFilter(jobs, config.filters, config.toInr, seen);

test("skips a job that an earlier run already saw", () => {
  const { kept, dropped } = run([job("a:1"), job("a:2")], { "a:1": new Date().toISOString() });
  assert.deepEqual(kept.map((j) => j.uid), ["a:2"]);
  assert.equal(dropped.duplicate, 1);
});

test("keeps one copy when a source returns the same job twice in a run", () => {
  const { kept, dropped } = run([job("a:1"), job("a:1")]);
  assert.equal(kept.length, 1);
  assert.equal(dropped.duplicate, 1);
});

test("history adds new ids, forgets old ones and leaves its input alone", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  const seen = { recent: "2026-11-01T00:00:00Z", stale: "2026-08-01T00:00:00Z" };
  const merged = mergeSeen(seen, ["new"], 60, now);
  assert.deepEqual(Object.keys(merged).sort(), ["new", "recent"]);
  assert.equal(merged.new, now.toISOString());
  assert.deepEqual(Object.keys(seen).sort(), ["recent", "stale"]);
});

test("merges board lists without checking any board twice, ignoring case", () => {
  const boards = allBoards({ boards: { greenhouse: ["Stripe", "stripe", "STRIPE", "figma"] } });
  const lower = boards.greenhouse.map((t) => t.toLowerCase());
  assert.equal(new Set(lower).size, lower.length);
  assert.ok(boards.greenhouse.includes("Stripe"));
});
