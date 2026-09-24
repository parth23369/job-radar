// Checks every board token in config.mjs and reports which ones respond, and how many jobs each has.
//   npm run check-boards
import config from "../config.mjs";
import { fetchGreenhouseBoard } from "../src/sources/greenhouse.mjs";
import { fetchLeverBoard } from "../src/sources/lever.mjs";
import { fetchAshbyBoard } from "../src/sources/ashby.mjs";
import { fetchSmartRecruitersBoard } from "../src/sources/smartrecruiters.mjs";
import { locationClass } from "../src/filters.mjs";

const fetchers = { greenhouse: fetchGreenhouseBoard, lever: fetchLeverBoard, ashby: fetchAshbyBoard, smartrecruiters: fetchSmartRecruitersBoard };
let ok = 0, bad = 0;
for (const [platform, tokens] of Object.entries(config.boards)) {
  console.log(`\n${platform}`);
  for (const t of tokens) {
    try {
      const jobs = await fetchers[platform](t);
      const eligible = jobs.filter((j) => locationClass(j)).length;
      console.log(`  ✓ ${t.padEnd(16)} ${String(jobs.length).padStart(4)} jobs, ${eligible} in India or remote`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${t.padEnd(16)} ${err.message}  → remove it or fix the token`);
      bad++;
    }
  }
}
console.log(`\n${ok} boards working, ${bad} not found.`);
