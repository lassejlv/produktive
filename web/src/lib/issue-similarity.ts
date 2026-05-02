import type { Issue } from "@/lib/api";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "to",
  "is",
  "and",
  "or",
  "but",
  "with",
  "when",
  "why",
  "how",
  "what",
  "as",
  "at",
  "by",
  "be",
  "it",
  "this",
  "that",
  "from",
]);

const WEIGHT_TITLE = 0.55;
const WEIGHT_BODY = 0.25;
const WEIGHT_SUBSTRING = 0.2;

const DEFAULT_MIN_SCORE = 0.28;
const DEFAULT_LIMIT = 3;
const SUBSTRING_RUN_LEN = 4;

export type ScoredIssue = { issue: Issue; score: number };

export function findSimilarIssues(
  query: string,
  issues: Issue[],
  opts: {
    excludeId?: string | null;
    minScore?: number;
    limit?: number;
  } = {},
): ScoredIssue[] {
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const queryNormalized = query.toLowerCase().trim();
  const queryTokens = tokenize(queryNormalized);
  if (queryTokens.size === 0) return [];

  const scored: ScoredIssue[] = [];
  for (const issue of issues) {
    if (opts.excludeId && issue.id === opts.excludeId) continue;
    const titleLower = issue.title.toLowerCase();
    const titleTokens = tokenize(titleLower);
    const descTokens = issue.description
      ? tokenize(issue.description.toLowerCase())
      : null;

    let titleHits = 0;
    let descHits = 0;
    for (const token of queryTokens) {
      if (titleTokens.has(token)) {
        titleHits++;
      } else if (descTokens?.has(token)) {
        descHits++;
      }
    }

    const titleScore = titleHits / queryTokens.size;
    const descScore = descHits / queryTokens.size;
    const substringBoost = hasSubstringRun(
      queryNormalized,
      titleLower,
      SUBSTRING_RUN_LEN,
    )
      ? 1
      : 0;

    const score = clamp01(
      WEIGHT_TITLE * titleScore +
        WEIGHT_BODY * descScore +
        WEIGHT_SUBSTRING * substringBoost,
    );
    if (score >= minScore) scored.push({ issue, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function tokenize(input: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of input.split(/[^a-z0-9]+/i)) {
    const t = raw.toLowerCase();
    if (t.length < 3) continue;
    if (STOP_WORDS.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

function hasSubstringRun(
  query: string,
  haystack: string,
  minLen: number,
): boolean {
  if (query.length < minLen || haystack.length < minLen) return false;
  for (let i = 0; i <= query.length - minLen; i++) {
    const slice = query.slice(i, i + minLen);
    if (/^\s+$/.test(slice)) continue;
    if (haystack.includes(slice)) return true;
  }
  return false;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
