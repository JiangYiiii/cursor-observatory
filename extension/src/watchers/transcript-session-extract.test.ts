import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countLikelyToolCalls,
  extractCapabilityIds,
  extractWorkspaceRelativePaths,
  isoRangeFromEntries,
} from "./transcript-session-extract";

describe("extractCapabilityIds", () => {
  it("prefers longer ids over subsumed shorter ones", () => {
    const known = ["FOO.BAR", "FOO"];
    const text = "Work on FOO.BAR module";
    expect(extractCapabilityIds(text, known)).toEqual(["FOO.BAR"]);
  });

  it("returns multiple independent ids", () => {
    const known = ["AAA.B", "CCC.D"];
    const text = "AAA.B and CCC.D";
    expect(extractCapabilityIds(text, known)).toEqual(["AAA.B", "CCC.D"]);
  });
});

describe("extractWorkspaceRelativePaths", () => {
  it("collects relative paths under workspace", () => {
    const ws = path.normalize("/proj/repo");
    const text = `edit extension/src/foo.ts and docs/README.md`;
    const got = extractWorkspaceRelativePaths(text, ws);
    expect(got).toContain("extension/src/foo.ts");
    expect(got.some((p) => p.includes("README"))).toBe(true);
  });
});

describe("countLikelyToolCalls", () => {
  it("counts tool-typed lines", () => {
    const n = countLikelyToolCalls([
      { type: "assistant", content: "hi" },
      { type: "tool_use", name: "read" },
    ]);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});

describe("isoRangeFromEntries", () => {
  it("uses min and max timestamps", () => {
    const r = isoRangeFromEntries(
      [
        { timestamp: "2026-04-05T12:00:00.000Z" },
        { timestamp: "2026-04-05T10:00:00.000Z" },
      ],
      () => "2026-01-01T00:00:00.000Z"
    );
    expect(r.first).toBe("2026-04-05T10:00:00.000Z");
    expect(r.last).toBe("2026-04-05T12:00:00.000Z");
  });
});
