/**
 * progress.json 时间线中的提交事件卡片。
 * primary_doc: docs/SCHEMA_SPEC.md §五, docs/FRONTEND_DESIGN.md §4.6
 */
import { GitBranch, GitCommit, User } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/common";
import { formatDateTimeZhFull } from "@/lib/format-time";
import type { ProgressTimelineEvent } from "@/types/observatory";

type Props = {
  event: ProgressTimelineEvent;
};

export function CommitEvent({ event }: Props) {
  const hash = event.commit?.hash;
  const branch = event.commit?.branch;
  const stats = event.stats as
    | { files_changed?: number; insertions?: number; deletions?: number }
    | undefined;
  const files = event.files ?? [];

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-[#32324a]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTimeZhFull(event.timestamp)}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {event.title ?? event.id}
          </h3>
          {event.author ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              <User className="size-3.5 shrink-0" aria-hidden />
              {event.author}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {event.type ? (
            <Badge variant="neutral" className="font-mono text-[10px]">
              {event.type}
            </Badge>
          ) : null}
          {hash ? (
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {hash.slice(0, 7)}
            </code>
          ) : null}
        </div>
      </div>

      {branch ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
          <GitBranch className="size-3.5" aria-hidden />
          {branch}
        </p>
      ) : null}

      {stats &&
      (stats.files_changed != null ||
        stats.insertions != null ||
        stats.deletions != null) ? (
        <p className="mt-2 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
          {stats.files_changed != null ? `${stats.files_changed} 个文件` : null}
          {stats.insertions != null ? ` · +${stats.insertions}` : ""}
          {stats.deletions != null ? ` · -${stats.deletions}` : ""}
        </p>
      ) : null}

      {event.capability_ids && event.capability_ids.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {event.capability_ids.map((id) => (
            <Badge key={id} variant="neutral" className="font-mono text-[10px]">
              {id}
            </Badge>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs">
          {files.map((f, i) => (
            <li
              key={`${f.path}-${i}`}
              className="truncate font-mono text-zinc-600 dark:text-zinc-400"
            >
              <span className="text-zinc-400">
                {f.status === "added"
                  ? "+"
                  : f.status === "modified"
                    ? "~"
                    : f.status === "deleted"
                      ? "-"
                      : "·"}
              </span>{" "}
              {f.path}
            </li>
          ))}
        </ul>
      ) : null}

      {event.session_id ? (
        <p className="mt-3 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-600">
          <GitCommit className="mr-1 inline size-3.5 text-zinc-400" aria-hidden />
          <span className="text-zinc-500">关联会话 </span>
          <Link
            to="/ai-sessions"
            state={{ highlightSessionId: event.session_id }}
            className="font-mono text-violet-600 hover:underline dark:text-violet-400"
          >
            {event.session_id}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
