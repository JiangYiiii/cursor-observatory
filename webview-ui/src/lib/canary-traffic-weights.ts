import type { CanaryDeployment } from "@/types/observatory";

/**
 * 构建切流权重：必须产生两个不同的版本键且总和为 100。
 * 当 blueVersion / greenVersion 为 "" 时，`??` 无法回退，且 `[""]` 作为键会互相覆盖成 `{"":50}`。
 * 优先使用接口返回的 weights 键（与后端 parseCanaryDeployment 的排序一致）。
 */
export function buildCanaryTrafficWeights(
  canary: CanaryDeployment | undefined,
  bluePercent: number,
  greenPercent: number,
): Record<string, number> {
  const w = canary?.weights;
  let result: Record<string, number>;
  if (w) {
    const keys = Object.keys(w).filter((k) => k !== "");
    if (keys.length >= 2) {
      const sorted = [...keys].sort((a, b) => a.localeCompare(b));
      result = { [sorted[0]]: bluePercent, [sorted[1]]: greenPercent };
    } else {
      let blueKey = canary?.blueVersion?.trim() || "blue";
      let greenKey = canary?.greenVersion?.trim() || "green";
      if (blueKey === greenKey) {
        blueKey = "blue";
        greenKey = "green";
      }
      result = { [blueKey]: bluePercent, [greenKey]: greenPercent };
    }
  } else {
    let blueKey = canary?.blueVersion?.trim() || "blue";
    let greenKey = canary?.greenVersion?.trim() || "green";
    if (blueKey === greenKey) {
      blueKey = "blue";
      greenKey = "green";
    }
    result = { [blueKey]: bluePercent, [greenKey]: greenPercent };
  }
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/1fbbff55-69cd-42d1-a261-168c6707b823',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c32067'},body:JSON.stringify({sessionId:'c32067',location:'canary-traffic-weights.ts:buildCanaryTrafficWeights',message:'output-weights',data:{bluePercent,greenPercent,result,canaryWeights:w,canaryBlueWeight:canary?.blueWeight,canaryGreenWeight:canary?.greenWeight},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  return result;
}
