import type { RunFullScanSddSummary } from "./scanners/sdd/types";

/** 全量扫描后附加展示的 SDD 提示（与 Initialize / Run Full Scan 共用）。 */
export function extraMessageForSddSummary(
  s: RunFullScanSddSummary | undefined
): string | undefined {
  if (!s) return undefined;
  if (s.sddDetected && s.sddFeatureCount > 0) {
    return `已导入 ${s.sddFeatureCount} 个 SDD feature 到能力看板。`;
  }
  if (s.sddStatus === "partial") {
    return "检测到部分 SDD 配置，可执行「Observatory: Configure SDD Integration」完成集成。";
  }
  return undefined;
}
