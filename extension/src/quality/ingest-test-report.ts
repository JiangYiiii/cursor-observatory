/**
 * 将 pytest-json-report / 规范化 JSON / JUnit XML 写入 Store。
 */
import * as vscode from "vscode";
import { applyCompletedFromTestResults } from "../capability/capability-lifecycle";
import type { ObservatoryStore } from "../observatory/store";
import type { TestHistoryLineV1, TestMapping, TestResults } from "../observatory/types";
import { aggregateByCapabilityFromTestCases } from "./aggregate-by-capability";
import { buildTestResultsFromJUnitXml, mergeJUnitXmlReports } from "./junit-xml-report";
import { buildTestResultsFromPytestJson } from "./pytest-json-report";
import { mergeTestMappings } from "./test-mapping-merge";

/** 规范化 JSON 常缺 by_capability；从 test_cases 补全后能力阶段才能按测试结果自动完工。 */
function ensureByCapabilityFromTestCases(raw: TestResults): TestResults {
  const by = raw.by_capability;
  if (by && typeof by === "object" && Object.keys(by).length > 0) {
    return raw;
  }
  const fromCases = aggregateByCapabilityFromTestCases(raw.test_cases);
  if (!fromCases) return raw;
  return { ...raw, by_capability: fromCases };
}

function historyLineFromTestResults(
  tr: TestResults,
  byCap: TestHistoryLineV1["by_capability"]
): TestHistoryLineV1 {
  const s = tr.summary as {
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    duration_ms?: number;
  };
  return {
    v: 1,
    timestamp: tr.last_run,
    total: Number(s.total ?? 0),
    passed: Number(s.passed ?? 0),
    failed: Number(s.failed ?? 0),
    skipped: s.skipped,
    duration_ms: Number(s.duration_ms ?? 0),
    by_capability: byCap,
  };
}

function getSddTestingCompleteOnTestsPass(
  cfg: vscode.WorkspaceConfiguration
): boolean {
  const insNew = cfg.inspect<boolean>("capability.sddTestingCompleteOnTestPass");
  if (
    insNew?.globalValue !== undefined ||
    insNew?.workspaceValue !== undefined ||
    insNew?.workspaceFolderValue !== undefined
  ) {
    return cfg.get<boolean>("capability.sddTestingCompleteOnTestPass", true);
  }
  const insOld = cfg.inspect<boolean>(
    "capability.sddTestingCompleteOnPytestPass"
  );
  if (
    insOld?.globalValue !== undefined ||
    insOld?.workspaceValue !== undefined ||
    insOld?.workspaceFolderValue !== undefined
  ) {
    return cfg.get<boolean>("capability.sddTestingCompleteOnPytestPass", true);
  }
  return cfg.get<boolean>("capability.sddTestingCompleteOnTestPass", true);
}

/** 已符合 Observatory 的规范化测试结果 JSON（扩展写入的 report.json 同形）。 */
export function isNormalizedObservatoryTestResultsJson(text: string): boolean {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return (
      typeof o.schema_version === "string" &&
      Array.isArray(o.test_cases) &&
      o.test_cases.length >= 0
    );
  } catch {
    return false;
  }
}

async function persistIngestResult(
  store: ObservatoryStore,
  raw: TestResults,
  autoMappingHints: Parameters<typeof mergeTestMappings>[1]
): Promise<TestResults> {
  const testResults = ensureByCapabilityFromTestCases(raw);
  const existing = await store.readJsonIfExists<TestMapping>("test-mapping.json");
  const merged = mergeTestMappings(existing, autoMappingHints);

  await store.writeTestResults(testResults);
  await store.writeTestMapping(merged);

  const byCap =
    testResults.by_capability as TestHistoryLineV1["by_capability"] | undefined;
  const line = historyLineFromTestResults(testResults, byCap);
  await store.appendTestHistoryLine(line);

  const cfg = vscode.workspace.getConfiguration("observatory");
  const autoComplete = cfg.get<boolean>("capability.autoCompleteOnTestsPass", true);
  const sddToCompleted = getSddTestingCompleteOnTestsPass(cfg);
  if (autoComplete) {
    await applyCompletedFromTestResults(store, testResults, {
      allowSddCompleted: sddToCompleted,
    });
  }
  return testResults;
}

export type TestReportFormat = "auto" | "pytest" | "junit" | "normalized";

/**
 * 根据内容自动识别：XML → JUnit；已规范化 JSON → 直接持久化；否则按 pytest-json-report 解析。
 */
export async function ingestTestReportText(
  store: ObservatoryStore,
  text: string,
  options?: { format?: TestReportFormat }
): Promise<{ testResults: TestResults }> {
  const fmt = options?.format ?? "auto";
  let format: Exclude<TestReportFormat, "auto">;
  if (fmt === "auto") {
    const t = text.trim();
    if (t.startsWith("<")) {
      format = "junit";
    } else if (isNormalizedObservatoryTestResultsJson(text)) {
      format = "normalized";
    } else {
      format = "pytest";
    }
  } else {
    format = fmt;
  }

  if (format === "normalized") {
    const parsed = JSON.parse(text) as TestResults;
    const testResults = await persistIngestResult(store, parsed, []);
    return { testResults };
  }

  if (format === "junit") {
    const { testResults: built, autoMappingHints } =
      buildTestResultsFromJUnitXml(text);
    const testResults = await persistIngestResult(
      store,
      built as unknown as TestResults,
      autoMappingHints
    );
    return { testResults };
  }

  const { testResults: built, autoMappingHints } =
    buildTestResultsFromPytestJson(text);
  const testResults = await persistIngestResult(
    store,
    built as unknown as TestResults,
    autoMappingHints
  );
  return { testResults };
}

/** 合并多份 Surefire XML 后写入（多模块 Maven）。 */
export async function ingestMergedJUnitXml(
  store: ObservatoryStore,
  parts: Array<{ xml: string; sourceHint?: string }>
): Promise<{ testResults: TestResults }> {
  const { testResults: built, autoMappingHints } = mergeJUnitXmlReports(parts);
  const testResults = await persistIngestResult(
    store,
    built as unknown as TestResults,
    autoMappingHints
  );
  return { testResults };
}

/**
 * pytest-json-report 字符串（兼容旧 API）。
 */
export async function ingestPytestJsonReport(
  store: ObservatoryStore,
  reportJson: string
): Promise<{ testResults: TestResults }> {
  return ingestTestReportText(store, reportJson, { format: "pytest" });
}
