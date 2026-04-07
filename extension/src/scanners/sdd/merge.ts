/**
 * 将 SDD 扫描行合并入基线 capabilities（测试与兼容保留）。
 * 全量扫描在存在 SDD feature 时改为仅写入 SDD 行，不再调用此合并。
 */

/** 高于「测试中」的终态：无 `observatory-sdd.json` 的 `declaredPhase` 时，不因任务全勾推断的 testing 覆盖这些阶段 */
const PHASES_PROTECTED_FROM_INFERRED_TESTING = new Set([
  "completed",
  "released",
  "deprecated",
]);

/**
 * 全量扫描合并后解析 `phase`：显式 `declaredPhase`（`phaseDeclaredInObservatorySdd`）始终采用扫描结果；
 * 否则若上次看板已为 completed/released/deprecated，本次扫描仅推断为 testing（任务全勾默认），则保留上次阶段，避免覆盖测试导入或已推进的终态。
 */
export function resolveSddPhaseAfterScanMerge(
  prev: Record<string, unknown>,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const sdd = merged.sdd as { phaseDeclaredInObservatorySdd?: boolean } | undefined;
  if (sdd?.phaseDeclaredInObservatorySdd === true) {
    return merged;
  }
  const prevPhase = String(prev.phase ?? "planning");
  const mergedPhase = String(merged.phase ?? "planning");
  if (
    mergedPhase === "testing" &&
    PHASES_PROTECTED_FROM_INFERRED_TESTING.has(prevPhase)
  ) {
    return { ...merged, phase: prevPhase };
  }
  return merged;
}

/**
 * 全量扫描仅反映当前 `specs/<feature>/` 列表；将同 `id` 的上一次看板行合并进本次扫描行。
 * 扫描产出的字段（phase、progress、sdd 等）覆盖旧值；用户在 `capabilities.json` 中自行添加的其它字段会保留。
 * `phase` 例外：见 `resolveSddPhaseAfterScanMerge`。
 */
export function mergeSddScanWithPrevious(
  previousCapabilities: Array<Record<string, unknown>>,
  sddRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const prevById = new Map<string, Record<string, unknown>>();
  for (const row of previousCapabilities) {
    if (typeof row.id === "string") prevById.set(row.id, row);
  }
  return sddRows.map((fresh) => {
    const id = fresh.id;
    if (typeof id !== "string") return fresh;
    const prev = prevById.get(id);
    if (!prev) return fresh;
    const merged = { ...prev, ...fresh };
    return resolveSddPhaseAfterScanMerge(prev, merged);
  });
}

/**
 * 将单条 SDD 扫描结果合并回完整 capabilities 列表（保留其它需求行不变）。
 */
export function applySingleSddScanToCapabilities(
  previousCapabilities: Array<Record<string, unknown>>,
  freshRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (freshRows.length !== 1) {
    throw new Error("applySingleSddScanToCapabilities: expected exactly one row");
  }
  const [mergedOne] = mergeSddScanWithPrevious(previousCapabilities, freshRows);
  const id = mergedOne.id;
  if (typeof id !== "string") {
    throw new Error("applySingleSddScanToCapabilities: merged row missing id");
  }
  const idx = previousCapabilities.findIndex(
    (r) => typeof r.id === "string" && r.id === id
  );
  if (idx >= 0) {
    const out = [...previousCapabilities];
    out[idx] = mergedOne;
    return out;
  }
  return [...previousCapabilities, mergedOne];
}

export function mergeSddIntoCapabilities(
  baseRows: Array<Record<string, unknown>>,
  sddRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of baseRows) {
    if (typeof r.id === "string") {
      byId.set(r.id, { ...r });
    }
  }
  for (const s of sddRows) {
    const id = s.id;
    if (typeof id !== "string") continue;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        ...existing,
        ...s,
        id,
      });
    } else {
      byId.set(id, { ...s });
    }
  }
  return [...byId.values()];
}
