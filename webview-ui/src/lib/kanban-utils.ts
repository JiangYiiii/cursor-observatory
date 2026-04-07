/**
 * 能力看板：阶段列与分组。
 * primary_doc: docs/SCHEMA_SPEC.md §四, docs/FRONTEND_DESIGN.md §4.3
 */
import type { Capability, CapabilityPhase } from "@/types/observatory";

/** 从能力对象解析用于排序/展示的时间戳（ISO 字符串） */
export function getCapabilityUpdatedIso(c: Capability): string | undefined {
  const raw =
    (typeof c.updatedAt === "string" && c.updatedAt) ||
    (typeof (c as Record<string, unknown>).updated_at === "string" &&
      ((c as Record<string, unknown>).updated_at as string)) ||
    undefined;
  return raw;
}

/** 用于排序的时间毫秒；无效则 0 */
export function getCapabilityUpdatedMs(c: Capability): number {
  const iso = getCapabilityUpdatedIso(c);
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** 看板列顺序（含 deprecated） */
export const KANBAN_PHASES: CapabilityPhase[] = [
  "planning",
  "designing",
  "developing",
  "testing",
  "completed",
  "released",
  "deprecated",
];

export const PHASE_TITLE: Record<CapabilityPhase, string> = {
  planning: "规划中",
  designing: "设计中",
  developing: "开发中",
  testing: "测试中",
  completed: "已完成",
  released: "已发布",
  deprecated: "已废弃",
};

export function normalizePhase(
  phase: string | undefined
): CapabilityPhase {
  if (
    phase &&
    KANBAN_PHASES.includes(phase as CapabilityPhase)
  ) {
    return phase as CapabilityPhase;
  }
  return "planning";
}

export function groupCapabilitiesByPhase(
  capabilities: Capability[]
): Record<CapabilityPhase, Capability[]> {
  const empty = {} as Record<CapabilityPhase, Capability[]>;
  for (const p of KANBAN_PHASES) {
    empty[p] = [];
  }
  for (const c of capabilities) {
    const p = normalizePhase(c.phase);
    empty[p].push(c);
  }
  for (const p of KANBAN_PHASES) {
    empty[p].sort((a, b) => {
      const tb = getCapabilityUpdatedMs(b);
      const ta = getCapabilityUpdatedMs(a);
      if (tb !== ta) return tb - ta;
      return String(a.title ?? a.id).localeCompare(String(b.title ?? b.id), "zh-CN");
    });
  }
  return empty;
}

export const DROPPABLE_PREFIX = "col-";
export const DRAGGABLE_PREFIX = "cap-";

export function droppableId(phase: CapabilityPhase): string {
  return `${DROPPABLE_PREFIX}${phase}`;
}

export function parseDroppableId(id: string): CapabilityPhase | null {
  if (!id.startsWith(DROPPABLE_PREFIX)) return null;
  const p = id.slice(DROPPABLE_PREFIX.length);
  return KANBAN_PHASES.includes(p as CapabilityPhase)
    ? (p as CapabilityPhase)
    : null;
}

export function draggableId(capId: string): string {
  return `${DRAGGABLE_PREFIX}${capId}`;
}

export function parseDraggableId(id: string | symbol): string | null {
  const s = String(id);
  if (!s.startsWith(DRAGGABLE_PREFIX)) return null;
  return s.slice(DRAGGABLE_PREFIX.length);
}
