import type { PipelineStageSummary } from "@/types/observatory";

/**
 * 发布面板是否应视为「已到可在控制台做蓝绿切流」的阶段。
 *
 * cdCanaryDeploy：在「灰度阶段」暂停并提示去「蓝绿切流」Tab；节点展示名常为「灰度阶段」，
 * 阶段推断会命中 `waiting_gray_confirm`（灰度），而不是 `waiting_bluegreen_switch`（蓝绿字样）。
 */
export function isAtBlueGreenTrafficStage(
  stage: PipelineStageSummary | undefined,
  ksPipelineType?: string,
): boolean {
  if (!stage) return false;
  if (stage.stageType === "waiting_bluegreen_switch") return true;
  if (ksPipelineType === "blue_green" && stage.stageType === "waiting_gray_confirm") return true;
  return false;
}
