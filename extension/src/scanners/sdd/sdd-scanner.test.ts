import { describe, expect, it } from "vitest";
import { mergeSddIntoCapabilities, mergeSddScanWithPrevious } from "./merge";
import { parseBugfixLog } from "./parse-bugfix";
import { parseTaskProgress, taskProgressPercent } from "./parse-tasks";
import { inferPhaseFromSddArtifacts } from "./phase-infer";
import { ensureUniqueCapabilityId, slugifyFeatureName } from "./capability-id";

describe("parseTaskProgress", () => {
  it("counts checkboxes", () => {
    const md = `
- [ ] T1
- [x] T2
- [X] T3
`;
    const p = parseTaskProgress(md);
    expect(p.total).toBe(3);
    expect(p.completed).toBe(2);
    expect(taskProgressPercent(p)).toBe(67);
  });

  it("returns 0 when no tasks", () => {
    const p = parseTaskProgress("# hello");
    expect(p.total).toBe(0);
    expect(taskProgressPercent(p)).toBe(0);
  });
});

describe("parseBugfixLog", () => {
  it("counts open vs resolved", () => {
    const md = `
## BF-001 (2026-04-05) 🔴 OPEN
**归因**: SPEC_GAP
text

## BF-002 (2026-04-06) ✅ RESOLVED
done
`;
    const s = parseBugfixLog(md);
    expect(s.activeBugs).toBe(1);
    expect(s.resolvedBugs).toBe(1);
    expect(s.rootCauses).toContain("SPEC_GAP");
  });
});

describe("inferPhaseFromSddArtifacts", () => {
  it("tasks incomplete -> developing", () => {
    expect(
      inferPhaseFromSddArtifacts({
        hasSpec: true,
        hasSketch: false,
        hasPlan: true,
        hasTasksFile: true,
        taskProgress: { total: 3, completed: 1 },
      })
    ).toBe("developing");
  });

  it("tasks complete -> testing", () => {
    expect(
      inferPhaseFromSddArtifacts({
        hasSpec: true,
        hasSketch: false,
        hasPlan: true,
        hasTasksFile: true,
        taskProgress: { total: 2, completed: 2 },
        skipTestingAfterTasks: false,
      })
    ).toBe("testing");
  });

  it("tasks complete + skipTestingAfterTasks -> completed", () => {
    expect(
      inferPhaseFromSddArtifacts({
        hasSpec: true,
        hasSketch: false,
        hasPlan: true,
        hasTasksFile: true,
        taskProgress: { total: 2, completed: 2 },
        skipTestingAfterTasks: true,
      })
    ).toBe("completed");
  });

  it("plan only -> designing", () => {
    expect(
      inferPhaseFromSddArtifacts({
        hasSpec: true,
        hasSketch: false,
        hasPlan: true,
        hasTasksFile: false,
        taskProgress: { total: 0, completed: 0 },
      })
    ).toBe("designing");
  });
});

describe("mergeSddScanWithPrevious", () => {
  it("preserves extra keys from previous row when ids match", () => {
    const out = mergeSddScanWithPrevious(
      [
        {
          id: "sdd:foo",
          title: "Old title",
          custom_notes: "keep me",
          phase: "developing",
        },
      ],
      [
        {
          id: "sdd:foo",
          title: "From spec",
          phase: "testing",
          progress: 100,
          sdd: { enabled: true, workspacePath: "specs/foo" },
          confidence: "high",
          user_confirmed: true,
        },
      ]
    );
    expect(out).toHaveLength(1);
    const row = out[0] as Record<string, unknown>;
    expect(row.custom_notes).toBe("keep me");
    expect(row.title).toBe("From spec");
    expect(row.phase).toBe("testing");
  });

  it("uses fresh row only when no previous id", () => {
    const out = mergeSddScanWithPrevious(
      [],
      [{ id: "sdd:new", title: "N", phase: "planning" }]
    );
    expect(out).toHaveLength(1);
    expect((out[0] as { title: string }).title).toBe("N");
  });
});

describe("mergeSddIntoCapabilities", () => {
  it("merges by id", () => {
    const merged = mergeSddIntoCapabilities(
      [{ id: "a", title: "A" }],
      [
        {
          id: "a",
          title: "A2",
          sdd: { enabled: true },
        },
      ]
    );
    expect(merged).toHaveLength(1);
    expect((merged[0] as { sdd?: { enabled: boolean } }).sdd?.enabled).toBe(
      true
    );
  });

  it("appends new sdd rows", () => {
    const merged = mergeSddIntoCapabilities(
      [{ id: "x", title: "X" }],
      [{ id: "sdd:foo", title: "F", sdd: { enabled: true } }]
    );
    expect(merged).toHaveLength(2);
  });
});

describe("capability-id helpers", () => {
  it("slugifyFeatureName", () => {
    expect(slugifyFeatureName("Bill Page Redesign!")).toBe(
      "bill-page-redesign"
    );
  });

  it("ensureUniqueCapabilityId", () => {
    const u = new Set<string>(["sdd:foo"]);
    expect(ensureUniqueCapabilityId("sdd:foo", u)).toBe("sdd:foo-2");
  });
});
