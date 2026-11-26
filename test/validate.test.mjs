// The checks on what the LLM sends back.
import test from "node:test";
import assert from "node:assert/strict";
import { validateItem, validateResults } from "../src/validate.mjs";

const item = (over = {}) => ({
  id: "0", level: "entry", yoe_min: 1, skills: ["Python"], remote_open_to_india: "unclear",
  pay_lpa_min: null, pay_lpa_max: null, tech_role: true, summary: "Builds APIs.", ...over
});
const rejects = (over) => assert.ok(validateItem(item(over), 5).error, JSON.stringify(over));

test("accepts a well-formed item and drops unknown keys", () => {
  const { index, value, error } = validateItem(item({ id: "3", injected: "x" }), 5);
  assert.equal(error, undefined);
  assert.equal(index, 3);
  assert.deepEqual(value, item({ id: "3" }));
});

test("repairs harmless slips", () => {
  const { value } = validateItem(
    { id: 1, level: "mid", yoe_min: "2", skills: [" Go ", "Go", ""], tech_role: true }, 5);
  assert.deepEqual(value, {
    id: "1", level: "mid", yoe_min: 2, pay_lpa_min: null, pay_lpa_max: null,
    skills: ["Go"], remote_open_to_india: "unclear", tech_role: true, summary: ""
  });
});

test("rejects an id that matches no job in the batch", () => {
  for (const id of ["", " ", "5", "-1", "1.5", "01", "abc", null, undefined]) rejects({ id });
});

test("rejects values outside the allowed lists", () => {
  rejects({ level: "guru" });
  rejects({ level: undefined });
  rejects({ remote_open_to_india: "maybe" });
});

test("rejects wrong types", () => {
  rejects({ yoe_min: "ten" });
  rejects({ yoe_min: -1 });
  rejects({ pay_lpa_min: "12 LPA" });
  rejects({ skills: "Python" });
  rejects({ skills: [1] });
  rejects({ tech_role: "yes" });
  rejects({ summary: 42 });
  assert.ok(validateItem(null, 5).error);
});

test("one bad or repeated item does not sink the batch", () => {
  const { accepted, rejected } = validateResults(
    { jobs: [item(), item({ id: "1", level: "guru" }), item({ id: "2" }), item({ summary: "second copy" })] }, 5);
  assert.deepEqual([...accepted.keys()], [0, 2]);
  assert.equal(accepted.get(0).summary, "Builds APIs.");
  assert.deepEqual(rejected.map((r) => r.reason), ["level is not an allowed value", "duplicate id"]);
});

test("throws when the reply has no jobs array", () => {
  for (const parsed of [null, undefined, {}, { jobs: {} }, [item()]]) {
    assert.throws(() => validateResults(parsed, 5), /no jobs array/);
  }
});
