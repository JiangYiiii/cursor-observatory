/**
 * 能力阶段本地持久化：在 Bridge 无 workspaceRoot 或 updateCapability 失败时仍可在刷新后保留拖拽结果。
 */
import type { Capability, CapabilityPhase } from "@/types/observatory";
import { isSddCapability } from "@/lib/sdd-utils";
import { KANBAN_PHASES, normalizePhase } from "@/lib/kanban-utils";

type Stored = Record<string, CapabilityPhase>;

function keyForRoot(workspaceRoot: string): string {
  return `observatory-capability-phases:${encodeURIComponent(workspaceRoot)}`;
}

/** 无 ?root= 时使用占位键，仍可做本地阶段缓存 */
export function resolvePhaseStorageRoot(workspaceRoot: string | null): string {
  if (workspaceRoot && workspaceRoot.length > 0) return workspaceRoot;
  return "__no_workspace_root__";
}

export function readLocalPhaseOverrides(workspaceRoot: string | null): Stored {
  if (typeof window === "undefined") return {};
  const root = resolvePhaseStorageRoot(workspaceRoot);
  try {
    const raw = window.localStorage.getItem(keyForRoot(root));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Stored = {};
    for (const [id, ph] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== "string" || typeof ph !== "string") continue;
      if (KANBAN_PHASES.includes(ph as CapabilityPhase)) {
        out[id] = ph as CapabilityPhase;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLocalPhaseOverride(
  workspaceRoot: string | null,
  id: string,
  phase: CapabilityPhase
): void {
  if (typeof window === "undefined") return;
  try {
    const r = resolvePhaseStorageRoot(workspaceRoot);
    const prev = readLocalPhaseOverrides(workspaceRoot);
    prev[id] = phase;
    window.localStorage.setItem(keyForRoot(r), JSON.stringify(prev));
  } catch {
    /* 配额或隐私模式 */
  }
}

/** 将服务端列表与本地阶段覆盖合并（本地覆盖优先）。 */
export function mergeCapabilitiesWithLocalPhases(
  capabilities: Capability[],
  workspaceRoot: string | null
): Capability[] {
  const overrides = readLocalPhaseOverrides(workspaceRoot);
  if (!Object.keys(overrides).length) return capabilities;
  return capabilities.map((c) => {
    if (isSddCapability(c)) return c;
    const ph = overrides[c.id];
    if (ph) {
      return { ...c, phase: normalizePhase(ph) };
    }
    return c;
  });
}
