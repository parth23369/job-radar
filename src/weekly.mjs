// Weekly report from the last 7 days of daily mails.
//   node src/weekly.mjs [--dry-run]
import config from "../config.mjs";
import { loadEnv, istDate, log } from "./util.mjs";
import { loadDays } from "./store.mjs";
import { loadMySkills } from "./skills.mjs";
import { renderWeekly, sendMail } from "./mail.mjs";

loadEnv();
const dryRun = process.argv.includes("--dry-run");
const dates = Array.from({ length: 7 }, (_, i) => istDate(new Date(Date.now() - (6 - i) * 86_400_000)));
const jobs = loadDays(dates);
log(`Weekly report ${dates[0]} → ${dates[6]}: ${jobs.length} jobs`);

const mySkills = await loadMySkills(config.portfolioDataUrl, config.fallbackSkills);
await sendMail(renderWeekly([dates[0], dates[6]], jobs, mySkills), { dryRun, tag: "weekly" });
