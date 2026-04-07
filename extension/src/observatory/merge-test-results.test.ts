import { describe, expect, it } from "vitest";
import { mergeTestResults } from "./merge-test-results";
import type { TestResults } from "./types";

const base = (id: string): TestResults => ({
  schema_version: "1.0.0",
  last_run: "2026-01-01T00:00:00.000Z",
  runner: "maven",
  summary: { total: 2, passed: 2, failed: 0, skipped: 0, errors: 0 },
  test_cases: [
    {
      id: `t-${id}`,
      file: "a.java",
      name: "n",
      status: "passed",
    },
  ],
  by_capability: {
    [id]: { total: 2, passed: 2, failed: 0 },
  },
});

describe("mergeTestResults", () => {
  it("merges by_capability and test_cases with dedupe by id", () => {
    const a = base("sdd:a");
    const b = base("sdd:b");
    const m = mergeTestResults(a, b);
    expect(m.by_capability).toMatchObject({
      "sdd:a": { total: 2, passed: 2, failed: 0 },
      "sdd:b": { total: 2, passed: 2, failed: 0 },
    });
    expect(m.test_cases.length).toBe(2);
    expect(m.summary.total).toBe(4);
  });
});
