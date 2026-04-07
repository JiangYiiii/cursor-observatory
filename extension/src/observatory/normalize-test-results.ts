/**
 * Ensure test-results / report.json shapes satisfy test-results.schema.json
 * (each test_cases[] item requires id, file, name, status).
 */
import type { TestResults } from "./types";

/** Placeholder for module summaries / AI rows without a real file path. */
export const SYNTHETIC_TEST_FILE = "_synthetic";

function str(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

/**
 * Returns a shallow copy of `data` with `test_cases` entries coerced to schema-required strings.
 */
export function normalizeTestResultsForSchema(data: TestResults): TestResults {
  const raw = data.test_cases;
  if (!Array.isArray(raw)) {
    return { ...data, test_cases: [] };
  }
  const test_cases = raw.map((row, i) => {
    if (!row || typeof row !== "object") {
      return {
        id: `invalid-row-${i}`,
        file: SYNTHETIC_TEST_FILE,
        name: "unnamed",
        status: "error",
      };
    }
    const r = row as Record<string, unknown>;
    const id = str(r.id, `case-${i}`);
    const fileRaw = r.file;
    const file =
      typeof fileRaw === "string" && fileRaw.length > 0
        ? fileRaw
        : SYNTHETIC_TEST_FILE;
    const name = str(r.name, id);
    const status = str(r.status, "error");
    return { ...r, id, file, name, status };
  });
  return { ...data, test_cases };
}

export function isTestResultsRelativePath(norm: string): boolean {
  return norm === "report.json" || norm === "test-results.json";
}
