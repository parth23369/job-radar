// Which "successful" runs should still raise an alert.
import test from "node:test";
import assert from "node:assert/strict";
import { healthProblems } from "../src/health.mjs";

const run = (over) => healthProblems({ fetched: 100, toRead: 10, read: 8, hasKey: true, dryRun: false, ...over });

test("passes a normal run, including a day with nothing new to read", () => {
  assert.deepEqual(run({}), []);
  assert.deepEqual(run({ toRead: 0, read: 0 }), []);
});

test("flags a run that fetched nothing, even a dry run", () => {
  assert.equal(run({ fetched: 0, toRead: 0, read: 0, dryRun: true }).length, 1);
});

test("flags unread descriptions, but not a local dry run without a key", () => {
  assert.match(run({ read: 0 })[0], /none of the 10/);
  assert.match(run({ read: 0, hasKey: false })[0], /GROQ_API_KEY/);
  assert.equal(run({ read: 0, dryRun: true }).length, 1);
  assert.deepEqual(run({ read: 0, hasKey: false, dryRun: true }), []);
});
