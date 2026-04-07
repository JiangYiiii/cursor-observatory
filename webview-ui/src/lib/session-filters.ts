/**
 * 会话索引筛选（状态 / 标签 / 时间 / 关键词）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.7, docs/SCHEMA_SPEC.md §十二
 */
import type { SessionIndexEntry } from "@/types/observatory";

export type SessionTimeRange = "all" | "7d" | "30d";

export function collectAllTags(entries: SessionIndexEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const tags = e.tags as string[] | undefined;
    if (tags) for (const t of tags) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function inTimeRange(iso: string | undefined, range: SessionTimeRange): boolean {
  if (range === "all" || !iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  const now = Date.now();
  const ms = range === "7d" ? 7 * 86400000 : 30 * 86400000;
  return now - t <= ms;
}

export function filterSessionEntries(
  entries: SessionIndexEntry[],
  opts: {
    status: string;
    tag: string;
    timeRange: SessionTimeRange;
    query: string;
  }
): SessionIndexEntry[] {
  const q = opts.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (opts.status !== "all" && String(e.status ?? "") !== opts.status) {
      return false;
    }
    if (opts.tag !== "all") {
      const tags = (e.tags as string[] | undefined) ?? [];
      if (!tags.includes(opts.tag)) return false;
    }
    const ts = (e.updated_at as string | undefined) ?? (e.created_at as string | undefined);
    if (!inTimeRange(ts, opts.timeRange)) return false;
    if (q) {
      const hay = [
        e.id,
        e.title,
        e.project,
        ...(e.tags as string[] | undefined),
        ...(e.capability_ids as string[] | undefined),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
