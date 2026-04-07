import { describe, expect, it } from "vitest";
import { buildTestResultsFromPytestJson } from "./pytest-json-report";

describe("buildTestResultsFromPytestJson", () => {
  it("parses minimal pytest-json-report shape", () => {
    const report = {
      created: 1,
      duration: 1.25,
      exitcode: 0,
      summary: {
        total: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
      },
      tests: [
        {
          nodeid: "tests/test_demo.py::test_a",
          outcome: "passed",
          duration: 0.01,
          metadata: { capability: "DEMO.CAP", scenario: "happy" },
        },
        {
          nodeid: "tests/test_demo.py::test_b",
          outcome: "passed",
          duration: 0.02,
          metadata: { capability: "DEMO.CAP" },
        },
      ],
    };

    const { testResults, autoMappingHints } = buildTestResultsFromPytestJson(
      JSON.stringify(report)
    );

    expect(testResults.runner).toBe("pytest");
    expect(testResults.test_cases).toHaveLength(2);
    expect(testResults.test_cases[0].capability_id).toBe("DEMO.CAP");
    expect(testResults.test_cases[0].scenario).toBe("happy");
    expect(testResults.by_capability?.["DEMO.CAP"]?.total).toBe(2);
    expect(testResults.by_capability?.["DEMO.CAP"]?.passed).toBe(2);
    expect(autoMappingHints).toHaveLength(1);
    expect(autoMappingHints[0].test_file).toBe("tests/test_demo.py");
  });

  it("throws on invalid JSON", () => {
    expect(() => buildTestResultsFromPytestJson("not json")).toThrow();
  });
});
