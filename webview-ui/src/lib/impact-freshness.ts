/**
 * 客户端新鲜度：与扩展侧 `resolveImpactOrTestFreshness` 规则对齐（字段级比对）。
 */
import type {
  DataFreshness,
  ImpactAnalysisResult,
  TestCasesResult,
} from "@/types/observatory";

export type GitSnapshot = {
  branch: string;
  headCommit: string;
  workingTreeFingerprint: string;
};

/** AI 直接写 JSON 时常见的占位符；与扩展计算的 Git 指纹永远不会相等，面板会显示「已过期」。与 extension `IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT` 保持同步。 */
export const IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT =
  "AI_PENDING_EXTENSION_INJECT";

export function impactAnalysisGitMetadataIsPlaceholder(
  impact: ImpactAnalysisResult | null | undefined
): boolean {
  return (
    typeof impact?.working_tree_fingerprint === "string" &&
    impact.working_tree_fingerprint ===
      IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT
  );
}

export function computeImpactFreshness(
  impact: ImpactAnalysisResult | null | undefined,
  git: GitSnapshot | null | undefined
): DataFreshness {
  if (!impact) return "missing";
  if (!git) return "stale";
  if (
    impact.workspace_branch === git.branch &&
    impact.head_commit === git.headCommit &&
    impact.working_tree_fingerprint === git.workingTreeFingerprint
  ) {
    return "fresh";
  }
  return "stale";
}

/** 测试用例 JSON 与当前影响分析 + Git 快照是否一致 */
export function computeTestCasesFreshness(
  tests: TestCasesResult | null | undefined,
  impact: ImpactAnalysisResult | null | undefined,
  git: GitSnapshot | null | undefined
): DataFreshness {
  if (!tests) return "missing";
  if (!impact || !git) return "stale";
  const alignsWithImpact =
    tests.source_impact_analysis_head_commit === impact.head_commit &&
    tests.source_impact_analysis_fingerprint === impact.working_tree_fingerprint;
  const alignsWithGit =
    tests.workspace_branch === git.branch &&
    tests.head_commit === git.headCommit &&
    tests.working_tree_fingerprint === git.workingTreeFingerprint;
  if (alignsWithImpact && alignsWithGit) return "fresh";
  return "stale";
}
