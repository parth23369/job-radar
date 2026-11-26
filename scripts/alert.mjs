// Emails you when a run fails. The GitHub workflow calls this; you can also try it yourself:
//   node scripts/alert.mjs --dry-run   (writes out/alert.html)
//   node scripts/alert.mjs             (sends a real test alert)
import { loadEnv, istDate, log, logCrashes } from "../src/util.mjs";
import { sendMail } from "../src/mail.mjs";

loadEnv();
logCrashes("alert");
const dryRun = process.argv.includes("--dry-run");
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, TEST_RESULT, RADAR_RESULT } = process.env;

const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null;
const body = runUrl
  ? `<p>Tests: <b>${TEST_RESULT || "unknown"}</b><br>Radar job: <b>${RADAR_RESULT || "unknown"}</b></p>
<p><a href="${runUrl}">Open the run and read the logs</a></p>
<p>If the radar job was skipped, no digest went out. If it failed, check the logs to see whether the digest was sent.</p>`
  : "<p>This is a test alert. It was not sent by a GitHub run.</p>";

await sendMail(
  { subject: `Job Radar ${runUrl ? "FAILED" : "test alert"} · ${istDate()}`, html: `<!doctype html><html><body><h2>Job Radar alert</h2>${body}</body></html>` },
  { dryRun, tag: "alert" }
);
log("Alert handled", { event: "alert", dry_run: dryRun, test_result: TEST_RESULT || null, radar_result: RADAR_RESULT || null });
