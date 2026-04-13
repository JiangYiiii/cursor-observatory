/**
 * 需求面板新鲜度（简化）：不再与 Git / 工作区指纹比对；有落盘 JSON 即视为可用。
 * 是否重跑分析由用户手动点击「重新分析」。
 */
import type {
  DataFreshness,
  ImpactAnalysisResult,
  TestCasesResult,
} from "@/types/observatory";

export function computeImpactFreshness(
  impact: ImpactAnalysisResult | null | undefined
): DataFreshness {
  if (!impact) return "missing";
  return "fresh";
}

/** 有 test-cases 落盘即 fresh；无文件为 missing。不与 impact / Git 交叉校验版本。 */
export function computeTestCasesFreshness(
  tests: TestCasesResult | null | undefined
): DataFreshness {
  if (!tests) return "missing";
  return "fresh";
}
