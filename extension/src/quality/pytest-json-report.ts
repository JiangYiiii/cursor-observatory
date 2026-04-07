/**
 * pytest-json-report JSON → test-results.json 形状（与 docs/SCHEMA_SPEC.md §六 对齐）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §八, docs/SCHEMA_SPEC.md §六–七
 */

import { aggregateByCapabilityFromTestCases } from "./aggregate-by-capability";

export type PytestOutcome = "passed" | "failed" | "skipped" | "error";

export interface ParsedTestCase {
  id: string;
  file?: string;
  name?: string;
  status: PytestOutcome;
  duration_ms?: number;
  capability_id?: string;
  scenario?: string;
  error_message?: string | null;
}

function parseNodeid(nodeid: string): { file?: string; name?: string } {
  const parts = nodeid.split("::");
  if (parts.length >= 1) {
    return { file: parts[0], name: parts[parts.length - 1] };
  }
  return {};
}

function normalizeOutcome(raw: string | undefined): PytestOutcome {
  const o = String(raw ?? "").toLowerCase();
  if (o === "passed" || o === "success") return "passed";
  if (o === "failed" || o === "failure") return "failed";
  if (o === "skipped" || o === "pending") return "skipped";
  return "error";
}

function extractCapabilityScenario(test: Record<string, unknown>): {
  capability_id?: string;
  scenario?: string;
} {
  const meta = test.metadata as Record<string, unknown> | undefined;
  if (meta) {
    const c =
      (typeof meta.capability === "string" && meta.capability) ||
      (typeof meta.capability_id === "string" && meta.capability_id) ||
      undefined;
    const s =
      (typeof meta.scenario === "string" && meta.scenario) || undefined;
    if (c || s) return { capability_id: c, scenario: s };
  }

  const up = test.user_properties as Array<{ name?: string; value?: unknown }> | undefined;
  if (Array.isArray(up)) {
    let capability_id: string | undefined;
    let scenario: string | undefined;
    for (const p of up) {
      const n = String(p.name ?? "").toLowerCase();
      if (n === "capability" || n === "capability_id") {
        capability_id = String(p.value ?? "");
      }
      if (n === "scenario") scenario = String(p.value ?? "");
    }
    if (capability_id || scenario) return { capability_id, scenario };
  }

  const kw = test.keywords as string[] | undefined;
  if (Array.isArray(kw)) {
    for (const k of kw) {
      const m = /^capability\((.+)\)$/.exec(k);
      if (m) return { capability_id: m[1].trim() };
    }
  }

  return {};
}

function extractErrorMessage(test: Record<string, unknown>): string | null {
  const call = test.call as { longrepr?: string } | undefined;
  if (call?.longrepr && typeof call.longrepr === "string") {
    return call.longrepr.slice(0, 4000);
  }
  const setup = test.setup as { longrepr?: string } | undefined;
  if (setup?.longrepr) return String(setup.longrepr).slice(0, 4000);
  return null;
}

function testDurationMs(test: Record<string, unknown>): number | undefined {
  const d = test.duration;
  if (typeof d === "number" && !Number.isNaN(d)) {
    return d < 500 ? Math.round(d * 1000) : Math.round(d);
  }
  return undefined;
}

export interface BuildTestResultsResult {
  testResults: {
    schema_version: string;
    last_run: string;
    runner: string;
    summary: Record<string, unknown>;
    test_cases: ParsedTestCase[];
    by_capability?: Record<string, { total: number; passed: number; failed: number }>;
  };
  /** 可由 marker/metadata 推断的映射条目（按 test_file 去重前） */
  autoMappingHints: Array<{
    test_file: string;
    capability_id: string;
    confidence: "high" | "medium";
    method: string;
  }>;
}

/**
 * 解析 pytest-json-report 整份 JSON 字符串。
 */
export function buildTestResultsFromPytestJson(reportJson: string): BuildTestResultsResult {
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(reportJson) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON: pytest report parse failed");
  }

  const tests = root.tests;
  const testList = Array.isArray(tests) ? tests : [];

  const now = new Date().toISOString();
  const cases: ParsedTestCase[] = [];
  const autoHints: BuildTestResultsResult["autoMappingHints"] = [];
  const seenFiles = new Set<string>();

  for (const t of testList) {
    if (!t || typeof t !== "object") continue;
    const rec = t as Record<string, unknown>;
    const nodeid = String(rec.nodeid ?? rec.nodeId ?? "");
    if (!nodeid) continue;

    const outcome = normalizeOutcome(
      String(rec.outcome ?? rec.result ?? "error")
    );
    const { file, name } = parseNodeid(nodeid);
    const { capability_id, scenario } = extractCapabilityScenario(rec);

    cases.push({
      id: nodeid,
      file,
      name,
      status: outcome,
      duration_ms: testDurationMs(rec),
      capability_id,
      scenario,
      error_message: outcome === "passed" ? null : extractErrorMessage(rec),
    });

    if (file && capability_id && !seenFiles.has(file)) {
      seenFiles.add(file);
      const method =
        rec.metadata && typeof rec.metadata === "object"
          ? "pytest_metadata"
          : Array.isArray(rec.user_properties)
            ? "user_properties"
            : "keywords";
      autoHints.push({
        test_file: file.replace(/\\/g, "/"),
        capability_id,
        confidence: method === "pytest_metadata" ? "high" : "medium",
        method,
      });
    }
  }

  const summary = root.summary as Record<string, unknown> | undefined;
  const passed = Number(summary?.passed ?? summary?.passed_tests ?? 0);
  const failed = Number(summary?.failed ?? 0);
  const skipped = Number(summary?.skipped ?? 0);
  const total =
    Number(summary?.total ?? summary?.collected ?? cases.length) ||
    cases.length;
  const durationRaw = root.duration;
  const duration_ms =
    typeof durationRaw === "number"
      ? durationRaw < 500
        ? Math.round(durationRaw * 1000)
        : Math.round(durationRaw)
      : undefined;

  const by_capability = aggregateByCapabilityFromTestCases(cases);

  return {
    testResults: {
      schema_version: "1.0.0",
      last_run: now,
      runner: "pytest",
      summary: {
        total,
        passed,
        failed,
        skipped,
        errors: Number(summary?.error ?? summary?.errors ?? 0),
        duration_ms,
      },
      test_cases: cases,
      by_capability,
    },
    autoMappingHints: autoHints,
  };
}
