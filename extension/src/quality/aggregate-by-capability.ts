/**
 * 从 test_cases 聚合 by_capability（与 junit-xml / pytest 聚合规则一致）。
 */
export function aggregateByCapabilityFromTestCases(
  testCases: unknown[]
): Record<string, { total: number; passed: number; failed: number }> | undefined {
  const m: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const raw of testCases) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const capability_id =
      typeof c.capability_id === "string"
        ? c.capability_id
        : typeof c.capability === "string"
          ? c.capability
          : undefined;
    if (!capability_id?.trim()) continue;
    const id = capability_id.trim();
    const status = String(c.status ?? "error").toLowerCase();
    if (!m[id]) m[id] = { total: 0, passed: 0, failed: 0 };
    m[id].total += 1;
    if (status === "passed") m[id].passed += 1;
    else if (status === "failed" || status === "error") m[id].failed += 1;
  }
  return Object.keys(m).length > 0 ? m : undefined;
}
