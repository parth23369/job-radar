// Checks what the LLM sent back before anything trusts it. The forced tool call makes the reply
// structured, but nothing guarantees that it matches the schema.
// A bad item is rejected on its own; the rest of the batch is kept.

export const LEVELS = ["intern", "entry", "mid", "senior", "unknown"];
export const REMOTE_VERDICTS = ["yes", "no", "unclear"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isMissing = (v) => v === undefined || v === null;

// A number >= 0, or null when not stated. Numeric text such as "2" is accepted as 2.
function optionalNumber(v) {
  if (isMissing(v) || v === "" || v === "null") return { ok: true, value: null };
  const n = typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? { ok: true, value: n } : { ok: false };
}

// Returns { index, value } for a usable item, or { error } saying what is wrong with it.
export function validateItem(item, batchSize) {
  if (!isObject(item)) return { error: "item is not an object" };

  const id = typeof item.id === "number" ? String(item.id) : item.id;
  if (typeof id !== "string" || !/^(0|[1-9]\d*)$/.test(id) || Number(id) >= batchSize) return { error: "id does not match a job in the batch" };

  if (!LEVELS.includes(item.level)) return { error: "level is not an allowed value" };

  const remote = isMissing(item.remote_open_to_india) ? "unclear" : item.remote_open_to_india;
  if (!REMOTE_VERDICTS.includes(remote)) return { error: "remote_open_to_india is not an allowed value" };

  if (typeof item.tech_role !== "boolean") return { error: "tech_role is not true or false" };

  const skills = isMissing(item.skills) ? [] : item.skills;
  if (!Array.isArray(skills) || !skills.every((s) => typeof s === "string")) return { error: "skills is not a list of text" };

  const summary = isMissing(item.summary) ? "" : item.summary;
  if (typeof summary !== "string") return { error: "summary is not text" };

  const numbers = {};
  for (const key of ["yoe_min", "pay_lpa_min", "pay_lpa_max"]) {
    const n = optionalNumber(item[key]);
    if (!n.ok) return { error: `${key} is not a number or null` };
    numbers[key] = n.value;
  }

  // Built field by field, so unexpected extra keys never reach the saved data.
  return {
    index: Number(id),
    value: {
      id,
      level: item.level,
      ...numbers,
      skills: [...new Set(skills.map((s) => s.trim()).filter(Boolean))],
      remote_open_to_india: remote,
      tech_role: item.tech_role,
      summary
    }
  };
}

// `parsed` is the decoded tool-call arguments: { jobs: [...] }.
// Throws if that outer shape is wrong, because then nothing in the reply can be used.
export function validateResults(parsed, batchSize) {
  if (!Array.isArray(parsed?.jobs)) throw new Error("LLM reply has no jobs array");
  const accepted = new Map(); // position in the batch -> facts
  const rejected = [];
  for (const item of parsed.jobs) {
    const result = validateItem(item, batchSize);
    if (result.error) rejected.push({ id: item?.id ?? null, reason: result.error });
    else if (accepted.has(result.index)) rejected.push({ id: item.id, reason: "duplicate id" });
    else accepted.set(result.index, result.value);
  }
  return { accepted, rejected };
}
