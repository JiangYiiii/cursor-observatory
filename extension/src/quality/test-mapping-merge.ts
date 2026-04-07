/**
 * 合并手动 test-mapping 与 pytest 报告推断的映射。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §3.1, docs/SCHEMA_SPEC.md §七
 */
import type { TestMapping } from "../observatory/types";

export type AutoMappingHint = {
  test_file: string;
  capability_id: string;
  confidence: "high" | "medium";
  method: string;
};

export function mergeTestMappings(
  existing: TestMapping | null,
  autoHints: AutoMappingHint[]
): TestMapping {
  const now = new Date().toISOString();
  const prev = Array.isArray(existing?.mappings) ? [...existing!.mappings] : [];
  const files = new Set(
    prev.map((m) => String((m as { test_file?: string }).test_file ?? ""))
  );

  for (const h of autoHints) {
    const norm = h.test_file.replace(/\\/g, "/");
    if (files.has(norm)) continue;
    files.add(norm);
    prev.push({
      test_file: norm,
      capability_id: h.capability_id,
      confidence: h.confidence,
      method: h.method,
      scenarios: {},
    });
  }

  return {
    schema_version: "1.0.0",
    generated_at: now,
    generation_method:
      "pytest_json_report_ingest + merge_manual",
    mappings: prev,
  };
}
