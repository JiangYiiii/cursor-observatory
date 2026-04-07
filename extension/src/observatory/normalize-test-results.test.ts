import { describe, expect, it } from "vitest";
import { ObservatoryValidator } from "./validator";
import {
  normalizeTestResultsForSchema,
  SYNTHETIC_TEST_FILE,
} from "./normalize-test-results";
import type { TestResults } from "./types";

function baseResults(overrides: Partial<TestResults> = {}): TestResults {
  return {
    schema_version: "1.0.0",
    last_run: "2026-04-07T12:00:00.000Z",
    runner: "manual",
    summary: { total: 1, passed: 1, failed: 0 },
    test_cases: [],
    ...overrides,
  };
}

describe("normalizeTestResultsForSchema", () => {
  it("fills missing file with synthetic placeholder", () => {
    const out = normalizeTestResultsForSchema(
      baseResults({
        test_cases: [
          {
            id: "tier-a",
            name: "Tier A",
            status: "passed",
          },
        ],
      })
    );
    expect(out.test_cases).toHaveLength(1);
    const row = out.test_cases[0] as Record<string, unknown>;
    expect(row.file).toBe(SYNTHETIC_TEST_FILE);
    expect(row.id).toBe("tier-a");
    expect(row.name).toBe("Tier A");
    expect(row.status).toBe("passed");
  });

  it("uses id as name when name is missing", () => {
    const out = normalizeTestResultsForSchema(
      baseResults({
        test_cases: [{ id: "x", status: "passed", file: "a.py" }],
      })
    );
    const row = out.test_cases[0] as Record<string, unknown>;
    expect(row.name).toBe("x");
  });

  it("replaces non-array test_cases with empty array", () => {
    const out = normalizeTestResultsForSchema(
      baseResults({ test_cases: null as unknown as unknown[] })
    );
    expect(out.test_cases).toEqual([]);
  });

  it("coerces invalid row entries to error-shaped cases", () => {
    const out = normalizeTestResultsForSchema(
      baseResults({
        test_cases: [null, "bad" as unknown as Record<string, unknown>],
      })
    );
    expect(out.test_cases).toHaveLength(2);
    expect((out.test_cases[0] as { id: string }).id).toBe("invalid-row-0");
    expect((out.test_cases[1] as { id: string }).id).toBe("invalid-row-1");
  });

  it("passes ObservatoryValidator after normalization for previously invalid rows", () => {
    const raw = baseResults({
      test_cases: [
        { id: "m", name: "模块汇总", status: "passed" },
        {
          id: "t::ok",
          file: "tests/x.py",
          name: "ok",
          status: "passed",
        },
      ],
    });
    const normalized = normalizeTestResultsForSchema(raw);
    const v = new ObservatoryValidator();
    expect(() => v.validate("report.json", normalized)).not.toThrow();
  });
});
