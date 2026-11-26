# job-radar

Every morning (~9:15–10:00 AM IST) you get one email with the previous day's new,
non-senior tech jobs in India (plus remote international roles open to India), paying
₹10 LPA+ where pay is known. Every Sunday you also get a weekly market report:
most-requested skills, which of them are missing from your portfolio, seniority mix,
top hiring companies.

Runs free on GitHub Actions. No server.

## Sources
| Source | What it gives | Key needed |
|---|---|---|
| Adzuna (India) | Job search across many Indian job sites, with salary filter | Free app id + key |
| Greenhouse | Full JDs from company boards | No |
| Lever | Full JDs from company boards | No |
| Ashby | Full JDs, often with salary | No |
| SmartRecruiters | Full JDs from company boards | No |

Company boards come from two places, merged automatically:
- `config.mjs`: boards you pick by hand. `npm run check-boards` verifies them.
- `data/discovered-boards.json`: written by `npm run discover-boards`, which extracts board names
  from public job lists on GitHub (~2,000 candidates), checks each one live, and keeps boards
  that currently have India/remote, non-senior tech roles. Re-run it every month or so.
LinkedIn is deliberately not a source: it has no public jobs API and scraping it risks your account.

## How a job gets into your mail
1. Fetched from a source.
2. Cheap filters: already seen before → skip; title isn't a tech role → skip; title says
   senior/staff/lead/principal/manager… → skip; on-site outside India → skip; posted more than
   3 days ago → skip; known pay below ₹10 LPA → skip.
3. An LLM (Groq, free) reads the description: level, years of experience, skills, pay if stated,
   and whether a remote role is open to people in India.
4. Second filters: needs more than 3 years (`maxYearsExperience` in config.mjs) → skip; remote but
   not open to India → skip.
5. Mailed, then remembered in `data/seen.json` so it never appears again.

Pay: most company boards don't publish Indian pay, so those jobs are kept and labelled
"CTC not disclosed". Set `keepUnknownSalary: false` in config.mjs to drop them instead.

## Setup (about 20 minutes)

### 1. Get the keys
- **Adzuna:** sign up at developer.adzuna.com and create an app → App ID + App Key.
- **Groq:** console.groq.com/keys → create a key named `job-radar`.
- **Gmail app password:** use a personal Gmail (college accounts often block this).
  Google Account → Security → turn on 2-Step Verification → search "App passwords" →
  create one named `job-radar` → copy the 16-character password.

### 2. Test on your laptop
```
npm ci
copy .env.example .env        (then fill in the values)
npm run check-boards          (see which company boards work)
npm run daily:dry             (writes out/daily.html instead of mailing; open it in a browser)
npm run weekly:dry            (writes out/weekly.html; empty until a few days of data exist)
```
`npm test` runs the unit tests and `npm run test:mock` runs the whole pipeline on fake data.
Neither needs keys or network access.

### Or run it in Docker
```
docker compose build
docker compose run --rm job-radar                                  (dry run: writes out/daily.html)
docker compose run --rm job-radar node src/weekly.mjs --dry-run
docker compose run --rm job-radar node src/daily.mjs               (real run: sends mail, updates data/)
```
Compose reads secrets from `.env`, which is neither committed nor copied into the image. `data/` and
`out/` are mounted from your folder. The image runs as the non-root `node` user and holds only
production dependencies. Run `docker compose build` again after changing code or config.
On Linux, run `mkdir -p out` first; if your user id is not 1000, add `--user "$(id -u)"` after `--rm`.

### 3. Put it on GitHub
1. Create a new repository `job-radar` (private is fine) and push this folder.
2. Repo → Settings → Secrets and variables → Actions → New repository secret. Add:
   `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `GROQ_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_TO`.
3. Actions tab → enable workflows → "Job Radar" → **Run workflow** once to test now.
   Tick "Also send the weekly report" if you want to see that mail too.

From then on it runs by itself every day at 09:15 IST, plus the weekly report on Sundays.

## Tests, CI and alerts
- **CI** (`.github/workflows/ci.yml`) runs the tests on every push and pull request, and also
  builds and smoke-tests the Docker image there.
- **The daily run depends on the tests.** `job-radar.yml` calls CI first, so a failing test means
  no digest that day, and an alert instead.
- **Logs** are one JSON object per line: counts and duration per stage, LLM calls, failed batches,
  rate-limit waits and rejected items. The last line of a run has `"event":"run_end"`.
- **Health check:** the run is marked failed if no postings were fetched at all, or if there were
  descriptions to read and none was read. The digest is sent and state is saved first.
- **Alert:** if tests or the run fail or time out, you get a mail with a link to the run.
  Try it with `node scripts/alert.mjs` (sends a test mail). If Gmail itself is the problem, the
  alert can't be sent either, so keep GitHub's own failed-workflow notifications switched on.

## Design choices and trade-offs

**GitHub Actions cron instead of a server.** The job runs once a day for minutes, so an always-on
server would sit idle and need patching. Actions gives scheduling, secret storage and logs for no
cost at this size. The price: start times can slip, there is no disk that survives between runs (so
state is committed to the repo), and GitHub can pause schedules on inactive public repositories (the
daily data commit counts as activity).

**A forced tool call at temperature 0.** The request forces the model to answer through
`report_jobs`, so facts arrive as structured arguments and no prose has to be parsed. Temperature 0
reduces variation between runs, which suits extraction. Neither one guarantees correct or
schema-valid output, so `src/validate.mjs` checks every item. A bad item is rejected on its own and
that job is treated as unread. Harmless slips (`"2"` for `2`, missing pay) are repaired. The
validator checks shape and allowed values, not whether the facts are true.

**Keyword filters before the LLM.** Title, location, age and pay checks are free and instant. LLM
reads are limited by per-minute and daily quotas, so only survivors are read: 5 per request, up to
150 a day, 1,800 characters of each description, software titles in India first. The trade-off is
false negatives: a job with an unusual title is dropped before anything reads it.

**Duplicates.** Each posting has an id of the form source, board, job number. Repeats within a run
are skipped, and ids that were examined are kept in `data/seen.json` for 60 days. Limits:
- the same job from two sources (say Adzuna and Greenhouse) has two ids and can appear twice;
- a job reposted under a new id counts as new;
- a job the LLM failed to read is still marked as seen, so it is not retried.

## What breaks

| What happens | Effect | Do you get an alert? |
|---|---|---|
| A job board changes its response format or a company moves platform | That source returns fewer or no postings; failed boards are logged as warnings | Only if every source returns nothing |
| LLM per-minute rate limit | Waits and retries, up to 4 attempts per batch | Only if nothing at all is read |
| LLM daily quota used up | Reading stops. Unread jobs are mailed (without skills) only if the title is clearly software, and unread remote ones only if the location is plain "Remote" | Only if nothing at all is read |
| LLM returns malformed output | Bad items or batches are rejected and counted | Only if nothing at all is read |
| An LLM request hangs | It has no timeout of its own; the job can run until the 45-minute limit | Yes, on time-out |
| Gmail app password revoked | The run fails before saving, so the jobs are tried again next run | GitHub's notification only |
| `main` moves while a run is in progress | The data push is rejected after the mail has gone, so jobs can repeat | Yes |
| A second real run on the same day | It overwrites that day's file in `data/jobs/`, so the weekly report loses the first run's jobs | No |
| Board discovery can't download its lists | It still rewrites `data/discovered-boards.json`, possibly with no boards | No |

## How I would scale it
1. Move state to a database with a unique key on source and job id, plus a fingerprint of company,
   title and location to catch cross-source duplicates.
2. Separate fetching from reading with a queue, so unread jobs are retried and workers respect a
   rate limit per provider.
3. Validate each source's responses and alert per source, not only when everything is empty.
4. Move to a paid LLM tier or a second provider once the daily quota is the bottleneck.
5. Run on a scheduled container service with metrics and dashboards once minutes or timing matter.

## Notes
- GitHub may start scheduled runs a few minutes late; the mail usually lands 9:15–10:00.
- The first run can be bigger than usual (everything from the last 3 days is "new").
- The action commits `data/` back to the repo daily. That's how it remembers what it sent,
  and it keeps the repo "active" so GitHub doesn't pause the schedule.
- Adzuna gives short description snippets, so skills for Adzuna jobs are less complete.
