/**
 * 会话索引列表（可选中）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.7
 */
import { Badge } from "@/components/common";
import { formatDateTimeZh } from "@/lib/format-time";
import { formatSessionDisplayTitle } from "@/lib/session-display-title";
import type { SessionIndexEntry } from "@/types/observatory";

type Props = {
  entries: SessionIndexEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function SessionList({ entries, selectedId, onSelect }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        没有符合筛选条件的会话。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-700" role="list">
      {entries.map((e) => {
        const active = e.id === selectedId;
        const updated = (e.updated_at as string | undefined) ?? (e.created_at as string | undefined);
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e.id)}
              className={`w-full px-3 py-2.5 text-left transition ${
                active
                  ? "bg-violet-50 dark:bg-violet-950/40"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50"
                  title={
                    (typeof e.title === "string" && e.title.trim().length > 0
                      ? e.title.trim()
                      : e.id) as string
                  }
                >
                  {formatSessionDisplayTitle(
                    e.title as string | undefined,
                    e.id
                  )}
                </span>
                {e.status ? (
                  <Badge variant="neutral" className="shrink-0 text-[10px]">
                    {String(e.status)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{e.id}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                {updated ? <span>{formatDateTimeZh(updated)}</span> : null}
                {e.message_count != null ? (
                  <span>消息 {e.message_count}</span>
                ) : null}
                {e.artifact_count != null ? (
                  <span>产物 {e.artifact_count}</span>
                ) : null}
              </div>
              {e.tags && (e.tags as string[]).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(e.tags as string[]).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
