/**
 * 期望场景与测试结果对齐（手动编辑 + 可选「按 scenario 标记」同步覆盖）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §四, docs/SCHEMA_SPEC.md §八
 */
import type {
  CapabilityExpectationBlock,
  ExpectationScenario,
  TestCaseRow,
  TestExpectations,
  TestResults,
} from "@/types/observatory";

export function parseCapabilityBlock(
  raw: unknown
): CapabilityExpectationBlock {
  if (!raw || typeof raw !== "object") return { scenarios: [] };
  const o = raw as {
    scenarios?: unknown;
    analysis_method?: string;
    last_analyzed?: string;
  };
  const list = Array.isArray(o.scenarios) ? o.scenarios : [];
  const scenarios: ExpectationScenario[] = list.map((row) => {
    const r = row as Record<string, unknown>;
    const pr = String(r.priority ?? "medium").toLowerCase();
    return {
      name: String(r.name ?? ""),
      priority: pr,
      covered: r.covered === true,
    };
  });
  return {
    scenarios,
    ...(o.analysis_method != null && o.analysis_method !== ""
      ? { analysis_method: o.analysis_method }
      : {}),
    ...(o.last_analyzed != null && o.last_analyzed !== ""
      ? { last_analyzed: o.last_analyzed }
      : {}),
  };
}

/**
 * 将「已通过」用例的 `scenario` 字段与期望场景 `name` 对齐，标记 covered。
 * 仅增强为 true，不把已有 true 强行改 false（避免覆盖手工确认）。
 */
export function syncCoveredFromTestResults(
  capabilityId: string,
  block: CapabilityExpectationBlock,
  testResults: TestResults | null
): CapabilityExpectationBlock {
  const passedScenarioLabels = new Set<string>();
  for (const c of testResults?.test_cases ?? []) {
    const row = c as TestCaseRow;
    if (row.capability_id !== capabilityId) continue;
    const st = String(row.status ?? "").toLowerCase();
    if (st !== "passed") continue;
    const sc = row.scenario?.trim();
    if (sc) passedScenarioLabels.add(sc);
  }
  return {
    ...block,
    scenarios: block.scenarios.map((s) => ({
      ...s,
      covered: passedScenarioLabels.has(s.name) ? true : s.covered,
    })),
  };
}

export function buildTestExpectationsDocument(
  previous: TestExpectations | null,
  capabilityId: string,
  block: CapabilityExpectationBlock
): TestExpectations {
  const schema_version = previous?.schema_version ?? "1.0.0";
  return {
    schema_version,
    generated_at: new Date().toISOString(),
    expectations: {
      ...(previous?.expectations ?? {}),
      [capabilityId]: {
        scenarios: block.scenarios,
        ...(block.analysis_method
          ? { analysis_method: block.analysis_method }
          : {}),
        ...(block.last_analyzed ? { last_analyzed: block.last_analyzed } : {}),
      },
    },
  };
}
