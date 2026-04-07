/**
 * 时间线排序与能力筛选。
 * primary_doc: docs/SCHEMA_SPEC.md §五, §九
 */
import type { AiSession, ProgressTimelineEvent } from "@/types/observatory";

export function matchesCapabilityFilter(
  capabilityIds: string[] | undefined,
  filter: string
): boolean {
  if (!filter) return true;
  return (capabilityIds ?? []).includes(filter);
}

export function sortTimelineByTimestampDesc(
  items: ProgressTimelineEvent[]
): ProgressTimelineEvent[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.timestamp ?? 0).getTime() -
      new Date(a.timestamp ?? 0).getTime()
  );
}

export function sortSessionsByStartedDesc(sessions: AiSession[]): AiSession[] {
  return [...sessions].sort(
    (a, b) =>
      new Date(String(b.started_at ?? 0)).getTime() -
      new Date(String(a.started_at ?? 0)).getTime()
  );
}
