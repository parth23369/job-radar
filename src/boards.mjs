// The full board list = boards in config.mjs + boards found by `npm run discover-boards`
// (saved in data/discovered-boards.json). Duplicates are removed.
import fs from "node:fs";

export function allBoards(config) {
  const merged = {};
  for (const [platform, tokens] of Object.entries(config.boards)) merged[platform] = [...tokens];
  try {
    const found = JSON.parse(fs.readFileSync(new URL("../data/discovered-boards.json", import.meta.url), "utf8"));
    for (const [platform, tokens] of Object.entries(found.boards || {})) {
      merged[platform] = [...(merged[platform] || []), ...tokens];
    }
  } catch { /* no discovery run yet */ }
  for (const p of Object.keys(merged)) {
    const seen = new Set();
    merged[p] = merged[p].filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  return merged;
}
