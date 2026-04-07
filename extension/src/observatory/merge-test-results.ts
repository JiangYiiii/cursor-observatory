/**
 * Merge multiple TestResults documents (e.g. one per SDD feature under specs/<name>/observatory/).
 */
import type { TestResults } from "./types";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mergeTestResults(a: TestResults, b: TestResults): TestResults {
  const ac = [...(a.test_cases ?? [])];
  const bc = [...(b.test_cases ?? [])];
  const seen = new Set<string>();
  for (const row of ac) {
    const id = (row as { id?: string }).id;
    if (typeof id === "string" && id.length > 0) seen.add(id);
  }
  for (const row of bc) {
    const id = (row as { id?: string }).id;
    if (typeof id === "string" && id.length > 0) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    ac.push(row);
  }
  const aBc =
    a.by_capability && typeof a.by_capability === "object"
      ? { ...a.by_capability }
      : {};
  const bBc =
    b.by_capability && typeof b.by_capability === "object"
      ? { ...b.by_capability }
      : {};
  const by_capability = { ...aBc, ...bBc };
  const asum = a.summary as Record<string, unknown> | undefined;
  const bsum = b.summary as Record<string, unknown> | undefined;
  const summary = {
    total: num(asum?.total) + num(bsum?.total),
    passed: num(asum?.passed) + num(bsum?.passed),
    failed: num(asum?.failed) + num(bsum?.failed),
    skipped: num(asum?.skipped) + num(bsum?.skipped),
    errors: num(asum?.errors) + num(bsum?.errors),
    duration_ms: num(asum?.duration_ms) + num(bsum?.duration_ms),
  };
  const lastCandidates = [a.last_run, b.last_run].filter(
    (x) => typeof x === "string" && x.length > 0
  );
  const last_run = lastCandidates.sort().slice(-1)[0] ?? a.last_run ?? b.last_run;
  return {
    ...a,
    schema_version: a.schema_version ?? b.schema_version,
    last_run,
    runner: a.runner || b.runner,
    summary,
    test_cases: ac,
    by_capability,
  };
}
