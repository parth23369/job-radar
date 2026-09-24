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
4. Second filters: needs more than 4 years → skip; remote but not open to India → skip.
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
npm install
copy .env.example .env        (then fill in the values)
npm run check-boards          (see which company boards work)
npm run daily:dry             (writes out/daily.html instead of mailing; open it in a browser)
npm run weekly:dry            (writes out/weekly.html; empty until a few days of data exist)
```
`node test/mock-run.mjs` runs the whole pipeline on fake data with no keys at all.

### 3. Put it on GitHub
1. Create a new repository `job-radar` (private is fine) and push this folder.
2. Repo → Settings → Secrets and variables → Actions → New repository secret. Add:
   `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `GROQ_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_TO`.
3. Actions tab → enable workflows → "Job Radar" → **Run workflow** once to test now.
   Tick "Also send the weekly report" if you want to see that mail too.

From then on it runs by itself every day at 09:15 IST, plus the weekly report on Sundays.

## Notes
- GitHub may start scheduled runs a few minutes late; the mail usually lands 9:15–10:00.
- The first run can be bigger than usual (everything from the last 3 days is "new").
- The action commits `data/` back to the repo daily. That's how it remembers what it sent,
  and it keeps the repo "active" so GitHub doesn't pause the schedule.
- Adzuna gives short description snippets, so skills for Adzuna jobs are less complete.
