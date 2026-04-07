import { describe, expect, it } from "vitest";
import { aggregateByCapabilityFromTestCases } from "./aggregate-by-capability";

describe("aggregateByCapabilityFromTestCases", () => {
  it("returns undefined when no capability_id", () => {
    expect(aggregateByCapabilityFromTestCases([{ status: "passed" }])).toBeUndefined();
  });

  it("aggregates passed/failed/error by capability_id", () => {
    expect(
      aggregateByCapabilityFromTestCases([
        { capability_id: "sdd:a", status: "passed" },
        { capability_id: "sdd:a", status: "failed" },
        { capability_id: "sdd:a", status: "error" },
        { capability_id: "sdd:b", status: "passed" },
      ])
    ).toEqual({
      "sdd:a": { total: 3, passed: 1, failed: 2 },
      "sdd:b": { total: 1, passed: 1, failed: 0 },
    });
  });

  it("accepts capability alias and trims id", () => {
    expect(
      aggregateByCapabilityFromTestCases([{ capability: " x ", status: "passed" }])
    ).toEqual({ x: { total: 1, passed: 1, failed: 0 } });
  });

  it("counts skipped in total only", () => {
    expect(
      aggregateByCapabilityFromTestCases([
        { capability_id: "sdd:a", status: "skipped" },
      ])
    ).toEqual({
      "sdd:a": { total: 1, passed: 0, failed: 0 },
    });
  });
});
