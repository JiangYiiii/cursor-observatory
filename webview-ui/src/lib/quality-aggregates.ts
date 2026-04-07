/**
 * 质量面板指标与能力行状态（与 docs/QUALITY_MONITOR_DESIGN.md §五 对齐）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §五, docs/SCHEMA_SPEC.md §六–八, §十三
 */
import type {
  Capability,
  TestExpectations,
  TestHistoryEntry,
  TestResults,
} from "@/types/observatory";

export type QualityStatus =
  | "missing"
  | "failed"
  | "insufficient"
  | "good"
  | "excellent";

export type MatrixFilter =
  | "all"
  | "missing"
  | "failed"
  | "insufficient"
  | "good"
  | "excellent";

export type MatrixSort = "severity" | "tests" | "name";

export interface OverviewMetrics {
  capabilityCoverage: { ratio: number; covered: number; total: number };
  passRate: { ratio: number; passed: number; total: number };
  scenarioCoverage: { ratio: number; covered: number; expected: number };
  totalCases: number;
  /** 相对约 7 天前最近一次记录的用例数变化，数据不足时为 null */
  weekDeltaCases: number | null;
}

export interface CapabilityQualityRow {
  capabilityId: string;
  title?: string;
  testTotal: number;
  testPassed: number;
  testFailed: number;
  scenarioExpected: number;
  scenarioCovered: number;
  status: QualityStatus;
}

const STATUS_RANK: Record<QualityStatus, number> = {
  missing: 0,
  failed: 1,
  insufficient: 2,
  good: 3,
  excellent: 4,
};

export function getByCapabilityStats(
  capId: string,
  testResults: TestResults | null
): { total: number; passed: number; failed: number } {
  const raw = testResults?.by_capability?.[capId] as
    | { total?: number; passed?: number; failed?: number }
    | undefined;
  if (raw && (raw.total != null || raw.passed != null)) {
    const out = {
      total: raw.total ?? 0,
      passed: raw.passed ?? 0,
      failed: raw.failed ?? 0,
    };
    // #region agent log
    fetch("http://127.0.0.1:7835/ingest/1fbbff55-69cd-42d1-a261-168c6707b823", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "54078b",
      },
      body: JSON.stringify({
        sessionId: "54078b",
        hypothesisId: "H4",
        location: "quality-aggregates.ts:getByCapabilityStats",
        message: "stats via by_capability",
        data: {
          capId,
          out,
          bcKeys: testResults?.by_capability
            ? Object.keys(testResults.by_capability as object)
            : [],
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return out;
  }
  const cases = testResults?.test_cases ?? [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    const row = c as {
      capability_id?: string;
      status?: string;
      metadata?: { capability_id?: string };
    };
    const rowCap =
      row.capability_id ??
      (typeof row.metadata?.capability_id === "string"
        ? row.metadata.capability_id
        : undefined);
    if (rowCap !== capId) continue;
    total += 1;
    const st = String(row.status ?? "").toLowerCase();
    if (st === "passed") passed += 1;
    else if (st === "failed" || st === "error") failed += 1;
  }
  // #region agent log
  fetch("http://127.0.0.1:7835/ingest/1fbbff55-69cd-42d1-a261-168c6707b823", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "54078b",
    },
    body: JSON.stringify({
      sessionId: "54078b",
      hypothesisId: "H4-H5",
      location: "quality-aggregates.ts:getByCapabilityStats",
      message: "stats via test_cases",
      data: {
        capId,
        out: { total, passed, failed },
        casesLen: cases.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return { total, passed, failed };
}

export function getScenarioCounts(
  capId: string,
  testExpectations: TestExpectations | null
): { expected: number; covered: number } {
  const exp = testExpectations?.expectations?.[capId] as
    | { scenarios?: Array<{ covered?: boolean }> }
    | undefined;
  const scenarios = exp?.scenarios ?? [];
  const expected = scenarios.length;
  const covered = scenarios.filter((s) => s.covered === true).length;
  return { expected, covered };
}

export function computeStatus(row: Omit<CapabilityQualityRow, "status">): QualityStatus {
  if (row.testTotal === 0) return "missing";
  if (row.testFailed > 0) return "failed";
  if (row.scenarioExpected === 0) {
    return row.testPassed === row.testTotal ? "good" : "failed";
  }
  const r = row.scenarioCovered / row.scenarioExpected;
  if (r >= 1) return "excellent";
  if (r >= 0.5) return "good";
  return "insufficient";
}

export function buildCapabilityQualityRows(
  capabilities: Capability[],
  testResults: TestResults | null,
  testExpectations: TestExpectations | null
): CapabilityQualityRow[] {
  return capabilities.map((cap) => {
    const stats = getByCapabilityStats(cap.id, testResults);
    const sc = getScenarioCounts(cap.id, testExpectations);
    const base = {
      capabilityId: cap.id,
      title: cap.title,
      testTotal: stats.total,
      testPassed: stats.passed,
      testFailed: stats.failed,
      scenarioExpected: sc.expected,
      scenarioCovered: sc.covered,
    };
    return { ...base, status: computeStatus(base) };
  });
}

export function computeOverviewMetrics(
  capabilities: Capability[],
  testResults: TestResults | null,
  testExpectations: TestExpectations | null,
  testHistory: TestHistoryEntry[]
): OverviewMetrics {
  const totalCaps = capabilities.length;
  const rows = buildCapabilityQualityRows(
    capabilities,
    testResults,
    testExpectations
  );
  const withTests = rows.filter((r) => r.testTotal > 0).length;

  const summary = testResults?.summary as
    | {
        total?: number;
        passed?: number;
        failed?: number;
      }
    | undefined;
  const tTotal = summary?.total ?? 0;
  const tPassed = summary?.passed ?? 0;

  let expectedTotal = 0;
  let coveredTotal = 0;
  for (const cap of capabilities) {
    const sc = getScenarioCounts(cap.id, testExpectations);
    expectedTotal += sc.expected;
    coveredTotal += sc.covered;
  }

  const weekDeltaCases = computeWeekDeltaCases(testHistory);

  return {
    capabilityCoverage: {
      ratio: totalCaps === 0 ? 0 : withTests / totalCaps,
      covered: withTests,
      total: totalCaps,
    },
    passRate: {
      ratio: tTotal === 0 ? 0 : tPassed / tTotal,
      passed: tPassed,
      total: tTotal,
    },
    scenarioCoverage: {
      ratio: expectedTotal === 0 ? 0 : coveredTotal / expectedTotal,
      covered: coveredTotal,
      expected: expectedTotal,
    },
    totalCases: tTotal,
    weekDeltaCases,
  };
}

function computeWeekDeltaCases(history: TestHistoryEntry[]): number | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const latest = sorted[0];
  const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const old = sorted.find((h) => new Date(h.timestamp).getTime() <= threshold);
  if (!old) return null;
  return latest.total - old.total;
}

export function filterMatrixRows(
  rows: CapabilityQualityRow[],
  filter: MatrixFilter
): CapabilityQualityRow[] {
  if (filter === "all") return rows;
  return rows.filter((r) => r.status === filter);
}

export function sortMatrixRows(
  rows: CapabilityQualityRow[],
  sort: MatrixSort
): CapabilityQualityRow[] {
  const copy = [...rows];
  if (sort === "name") {
    copy.sort((a, b) =>
      a.capabilityId.localeCompare(b.capabilityId, "en", { sensitivity: "base" })
    );
    return copy;
  }
  if (sort === "tests") {
    copy.sort((a, b) => b.testTotal - a.testTotal);
    return copy;
  }
  copy.sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]
  );
  return copy;
}

export function statusLabel(status: QualityStatus): string {
  switch (status) {
    case "missing":
      return "缺失";
    case "failed":
      return "失败";
    case "insufficient":
      return "不足";
    case "good":
      return "良好";
    case "excellent":
      return "优秀";
    default:
      return status;
  }
}

/** 近 N 天每日测试运行次数（按 history 条目的日期聚合） */
export function dailyRunCounts(
  history: TestHistoryEntry[],
  days = 28
): { date: string; count: number }[] {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const h of history) {
    const d = new Date(h.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

export function historySeriesForCapability(
  history: TestHistoryEntry[],
  capabilityId: string | null
): { ts: string; total: number; passRate: number }[] {
  const sorted = [...history].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return sorted.map((h) => {
    if (capabilityId && h.by_capability) {
      const bc = h.by_capability[capabilityId] as
        | { total?: number; passed?: number }
        | undefined;
      if (bc && bc.total != null && bc.total > 0) {
        const tot = bc.total;
        const p = bc.passed ?? 0;
        return {
          ts: h.timestamp,
          total: tot,
          passRate: p / tot,
        };
      }
    }
    const tot = h.total || 0;
    const p = h.passed ?? 0;
    return {
      ts: h.timestamp,
      total: tot,
      passRate: tot === 0 ? 0 : p / tot,
    };
  });
}
