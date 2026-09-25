// ─────────────────────────────────────────────────────────────
// Everything you'd want to tune lives here.
// ─────────────────────────────────────────────────────────────

export default {
  // ── Adzuna (India only) ────────────────────────────────────
  adzuna: {
    country: "in",
    // One API call per query per day (free tier has daily limits; ~7 calls is well within them).
    queries: [
      "software engineer",
      "software developer",
      "backend developer",
      "SDE",
      "machine learning engineer",
      "data scientist",
      "embedded software engineer"
    ],
    resultsPerQuery: 50,
    // Adzuna removes these words server-side, before our own seniority filter runs.
    exclude: "senior sr lead principal staff manager director head architect vp"
  },

  // ── Company job boards (public APIs, no key needed) ────────
  // Board tokens = the part of the careers URL after the platform domain.
  // Verified with `npm run check-boards`; every board below has India or remote roles.
  // Re-run check-boards every month or two: companies change platforms.
  boards: {
    greenhouse: [   // boards-api.greenhouse.io/v1/boards/<token>/jobs
      "databricks", "stripe", "rubrik", "mongodb", "gitlab", "cloudflare",
      "coinbase", "airbnb", "twilio", "okta", "samsara", "anthropic",
      "figma", "discord", "instacart", "datadog", "elastic", "purestorage",
      "toast", "zscaler"
    ],
    lever: [        // api.lever.co/v0/postings/<token>
      "meesho", "cred", "zeta", "mindtickle"
    ],
    ashby: [        // api.ashbyhq.com/posting-api/job-board/<token>
      "openai", "notion", "ramp", "linear", "supabase", "replit",
      "posthog", "clerk", "cohere", "perplexity", "sarvam"
    ],
    smartrecruiters: [ // api.smartrecruiters.com/v1/companies/<token>/postings
      "BoschGroup", "ServiceNow", "Freshworks", "Canva"
    ]
  },

  // ── Board discovery (`npm run discover-boards`) ────────────
  // Public, machine-readable job lists maintained on GitHub. Their application links
  // reveal which companies use which platform. Add more lists in the same format if you find them.
  discovery: {
    lists: [
      "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
      "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json"
    ],
    minEligibleJobs: 3   // keep a board only if it has at least this many India/remote, non-senior SOFTWARE roles open
  },

  // ── Filters ────────────────────────────────────────────────
  filters: {
    minLpa: 10,                  // the BOTTOM of a known pay range must be at least this (₹ lakh per annum)
    keepUnknownSalary: true,     // most boards don't publish Indian pay; true = keep and label "CTC not disclosed"
    maxPostedAgeDays: 3,         // ignore postings older than this (protects the first run from flooding)
    maxYearsExperience: 3,       // drop jobs asking for more than this many years (your target: 0–3)

    // Title must contain at least one of these (keeps it to tech roles).
    roleKeywords: [
      "engineer", "developer", "sde", "swe", "software", "backend", "back-end", "frontend", "front-end",
      "full stack", "fullstack", "data", "machine learning", "ml", "ai", "scientist",
      "embedded", "firmware", "systems", "platform", "devops", "sre", "reliability", "quant",
      "research", "infrastructure", "security", "kernel", "graduate", "intern"
    ],
    // Title must contain none of these (seniority + non-engineering roles that match "engineer").
    titleExclude: [
      "senior", "sr", "sr.", "staff", "principal", "lead", "manager", "director", "head",
      "architect", "vp", "vice president", "distinguished", "fellow", "chief", "iii", "iv",
      "sales", "solutions engineer", "support", "escalation", "customer success", "recruiter",
      "recruiting", "talent", "marketing", "growth marketing", "communications", "audiovisual",
      "account executive", "legal", "finance", "hr", "strategist", "pre-sales", "presales",
      // non-software engineering and non-tech roles that contain "engineer", "data" or "research"
      "civil", "structural", "structures", "bridge", "bridges", "building", "buildings", "construction",
      "mechanical", "electrical", "hvac", "piping", "maintenance", "loco", "locomotive", "field service",
      "site engineer", "service engineer", "seals", "manufacturing", "production engineer", "quality inspector",
      "data entry", "apprentice", "project controls", "research analyst", "business systems analyst", "sap"
    ],
    // Company names containing any of these are skipped (staffing agencies that repost the same roles).
    excludeCompanies: ["Trigent Software", "Staffnixcom", "Career Guidance Technologies", "Happiest Resume"]
  },

  // ── Money ─────────────────────────────────────────────────
  // Approximate conversion for comparing foreign pay against minLpa. Update occasionally.
  toInr: { INR: 1, USD: 85, EUR: 92, GBP: 108, CAD: 62, AUD: 56, SGD: 64 },

  // ── LLM enrichment (Groq, OpenAI-compatible) ───────────────
  llm: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-20b",   // small + fast: plenty for extracting skills from a JD
    batchSize: 5,                  // jobs per request
    maxJobsPerDay: 150,            // jobs beyond this are listed without skill extraction
    descriptionChars: 1800,        // per job; smaller = more jobs read before the free daily quota runs out
    pauseMs: 4000,                 // gap between requests (free tier is rate-limited per minute)
    maxMinutes: 12                 // stop reading JDs after this long; the mail still goes out on time
  },

  // ── Your skills (for the weekly "what to learn" section) ───
  // Pulled from your live portfolio so it stays in sync. Falls back to the list below.
  portfolioDataUrl: "https://parth-sharma.vercel.app/js/data.js",
  fallbackSkills: [
    "C", "C++", "Python", "Java", "JavaScript", "SQL", "Linux", "Linux kernel", "Device drivers",
    "POSIX", "Pthreads", "gdb", "ARM", "QEMU", "FastAPI", "Flask", "PostgreSQL", "OAuth 2.0",
    "REST APIs", "UDP sockets", "Statistics", "Control theory", "Convex optimization",
    "NumPy", "SciPy", "pandas", "OpenCV", "scikit-learn", "Machine learning"
  ],

  keepHistoryDays: 60             // how long job IDs are remembered for de-duplication
};
