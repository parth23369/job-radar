// Canonical skill names so "golang" and "Go" count as the same thing,
// plus your own skills (pulled from your portfolio) for the weekly "what to learn" section.
import vm from "node:vm";
import { log } from "./util.mjs";

const ALIASES = {
  "golang": "Go", "go": "Go", "js": "JavaScript", "javascript": "JavaScript", "typescript": "TypeScript", "ts": "TypeScript",
  "node": "Node.js", "nodejs": "Node.js", "node.js": "Node.js", "reactjs": "React", "react.js": "React", "react": "React",
  "c/c++": "C++", "cpp": "C++", "c++": "C++", "c": "C", "python": "Python", "java": "Java",
  "postgres": "PostgreSQL", "postgresql": "PostgreSQL", "sql": "SQL", "mysql": "MySQL",
  "k8s": "Kubernetes", "kubernetes": "Kubernetes", "docker": "Docker", "aws": "AWS", "amazon web services": "AWS",
  "gcp": "GCP", "google cloud": "GCP", "azure": "Azure", "ml": "Machine learning", "machine learning": "Machine learning",
  "deep learning": "Deep learning", "llm": "LLMs", "llms": "LLMs", "large language models": "LLMs",
  "pytorch": "PyTorch", "tensorflow": "TensorFlow", "linux": "Linux", "system design": "System design",
  "distributed systems": "Distributed systems", "data structures": "DSA", "algorithms": "DSA", "dsa": "DSA",
  "data structures and algorithms": "DSA", "rest": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs",
  "microservices": "Microservices", "kafka": "Kafka", "spark": "Spark", "git": "Git", "ci/cd": "CI/CD"
};

export function canonical(skill) {
  const k = skill.trim().toLowerCase();
  return ALIASES[k] || skill.trim().replace(/\s+/g, " ");
}

// Returns a Set of lowercase canonical skill names Parth already shows on his site.
export async function loadMySkills(url, fallback) {
  let list = fallback;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sandbox = { window: {} };
    vm.runInNewContext(await res.text(), sandbox);
    const D = sandbox.window.PORTFOLIO;
    list = [
      ...D.skills.flatMap((g) => g.items),
      ...[...D.projects, ...D.research, ...D.experience, ...D.coursework].flatMap((x) => x.tech || [])
    ];
  } catch (err) {
    log(`⚠ Couldn't read portfolio skills (${err.message}); using fallback list`);
  }
  const mine = new Set(list.map((s) => canonical(s).toLowerCase()));
  if (mine.has("linux kernel")) mine.add("linux");
  if (mine.has("pthreads")) mine.add("multithreading");
  return mine;
}
