/**
 * Surefire / JUnit XML → 与 pytest-json-report 相同的 TestResults 聚合形状。
 */
import { aggregateByCapabilityFromTestCases } from "./aggregate-by-capability";
import type { BuildTestResultsResult, ParsedTestCase } from "./pytest-json-report";

function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}=["']([^"']*)["']`, "i");
  const m = re.exec(attrs);
  return m?.[1];
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 从 testcase 片段解析 capability（JUnit 5 properties 或 @Tag 文本启发式） */
function extractCapabilityFromCaseBody(inner: string): string | undefined {
  const prop = /<property\s+[^>]*name=["'](?:capability|capability_id)["'][^>]*value=["']([^"']*)["'][^>]*\/?>/i.exec(
    inner
  );
  if (prop?.[1]) return prop[1].trim();
  const tag = /@Tag\s*\(\s*["']([^"']+)["']\s*\)/.exec(inner);
  if (tag?.[1]) return tag[1].trim();
  return undefined;
}

function outcomeFromInner(inner: string): ParsedTestCase["status"] {
  if (/<failure\b/i.test(inner)) return "failed";
  if (/<error\b/i.test(inner)) return "error";
  if (/<skipped\b/i.test(inner)) return "skipped";
  return "passed";
}

function errorFromInner(inner: string): string | null {
  const f = /<failure[^>]*>([\s\S]*?)<\/failure>/i.exec(inner);
  const e = /<error[^>]*>([\s\S]*?)<\/error>/i.exec(inner);
  const raw = f?.[1] ?? e?.[1];
  if (!raw) return null;
  return stripTags(raw).slice(0, 4000);
}

/**
 * 解析单个 Surefire `TEST-*.xml` 文件内容。
 */
export function buildTestResultsFromJUnitXml(
  xml: string,
  sourceHint?: string
): BuildTestResultsResult {
  const now = new Date().toISOString();
  const cases: ParsedTestCase[] = [];
  const autoHints: BuildTestResultsResult["autoMappingHints"] = [];
  const seenFiles = new Set<string>();

  /** 支持 `<testcase .../>` 与 `<testcase ...>...</testcase>` */
  const testcaseRe =
    /<testcase\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let m: RegExpExecArray | null;
  while ((m = testcaseRe.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const name = attr(attrs, "name") ?? "unknown";
    const classname = attr(attrs, "classname") ?? "";
    const timeStr = attr(attrs, "time");
    const file = classname ? classname.replace(/\./g, "/") + ".java" : undefined;
    const id = classname ? `${classname}#${name}` : name;
    const duration_ms =
      timeStr !== undefined
        ? Math.round(parseFloat(timeStr) * 1000)
        : undefined;
    const status = outcomeFromInner(inner);
    const capability_id = extractCapabilityFromCaseBody(inner);
    cases.push({
      id,
      file,
      name,
      status,
      duration_ms,
      capability_id,
      scenario: undefined,
      error_message: status === "passed" ? null : errorFromInner(inner),
    });
    if (file && capability_id && !seenFiles.has(file)) {
      seenFiles.add(file);
      autoHints.push({
        test_file: file.replace(/\\/g, "/"),
        capability_id,
        confidence: "medium",
        method: "junit_xml_heuristic",
      });
    }
  }

  const passed = cases.filter((c) => c.status === "passed").length;
  const failed = cases.filter((c) => c.status === "failed").length;
  const skipped = cases.filter((c) => c.status === "skipped").length;
  const errors = cases.filter((c) => c.status === "error").length;
  const durationSuite = /<testsuite[^>]*\btime=["']([\d.]+)["']/i.exec(xml);
  const duration_ms = durationSuite?.[1]
    ? Math.round(parseFloat(durationSuite[1]) * 1000)
    : undefined;

  const by_capability = aggregateByCapabilityFromTestCases(cases);

  return {
    testResults: {
      schema_version: "1.0.0",
      last_run: now,
      runner: "junit",
      summary: {
        total: cases.length,
        passed,
        failed,
        skipped,
        errors,
        duration_ms,
        source: sourceHint,
      },
      test_cases: cases,
      by_capability,
    },
    autoMappingHints: autoHints,
  };
}

/**
 * 合并多个 Surefire 报告片段（多模块）为单一 TestResults。
 */
export function mergeJUnitXmlReports(
  parts: Array<{ xml: string; sourceHint?: string }>
): BuildTestResultsResult {
  if (parts.length === 0) {
    throw new Error("No JUnit XML content to merge");
  }
  if (parts.length === 1) {
    return buildTestResultsFromJUnitXml(parts[0].xml, parts[0].sourceHint);
  }

  const allCases: ParsedTestCase[] = [];
  const allHints: BuildTestResultsResult["autoMappingHints"] = [];
  for (const p of parts) {
    const one = buildTestResultsFromJUnitXml(p.xml, p.sourceHint);
    allCases.push(...(one.testResults.test_cases as ParsedTestCase[]));
    allHints.push(...one.autoMappingHints);
  }

  const passed = allCases.filter((c) => c.status === "passed").length;
  const failed = allCases.filter(
    (c) => c.status === "failed" || c.status === "error"
  ).length;
  const skipped = allCases.filter((c) => c.status === "skipped").length;

  const by_capability = aggregateByCapabilityFromTestCases(allCases);

  return {
    testResults: {
      schema_version: "1.0.0",
      last_run: new Date().toISOString(),
      runner: "junit",
      summary: {
        total: allCases.length,
        passed,
        failed,
        skipped,
        errors: allCases.filter((c) => c.status === "error").length,
      },
      test_cases: allCases,
      by_capability,
    },
    autoMappingHints: allHints,
  };
}
