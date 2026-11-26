// Failures that the pipeline survives (nothing crashes) but that you should still hear about.

// Exit code of a run that finished, mailed and saved, but failed the health check.
// A crash exits with 1, so the workflow can tell the two apart.
export const UNHEALTHY_EXIT = 2;

export function healthProblems({ fetched, toRead, read, hasKey, dryRun }) {
  const problems = [];
  if (fetched === 0) problems.push("no postings were fetched from any source");
  // A local dry run without a key is a normal way to try the project, so it is not flagged.
  if (toRead > 0 && read === 0 && (hasKey || !dryRun)) {
    problems.push(hasKey
      ? `none of the ${toRead} job descriptions could be read by the LLM`
      : "GROQ_API_KEY is not set, so no job descriptions were read");
  }
  return problems;
}
