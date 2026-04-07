/**
 * 概览页：最近 AI 会话摘要列表（非全页时间线）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.1
 */
import { Bot } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { AiSession } from "@/types/observatory";
import { formatDateTimeZh } from "@/lib/format-time";
import { formatSessionDisplayTitle } from "@/lib/session-display-title";

type Props = {
  sessions: AiSession[];
  max?: number;
  className?: string;
};

export function RecentAiSessionList({
  sessions,
  max = 8,
  className = "",
}: Props) {
  const sorted = useMemo(() => {
    return [...sessions]
      .sort((a, b) => {
        const ta = new Date(String(a.started_at ?? 0)).getTime();
        const tb = new Date(String(b.started_at ?? 0)).getTime();
        return tb - ta;
      })
      .slice(0, max);
  }, [sessions, max]);

  if (sorted.length === 0) {
    return (
      <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className}`}>
        暂无 AI 会话记录。
      </p>
    );
  }

  return (
    <ul className={`space-y-3 ${className}`}>
      {sorted.map((s) => {
        const title = formatSessionDisplayTitle(
          typeof s.title === "string" ? s.title : undefined,
          String(s.id ?? "会话")
        );
        const status = typeof s.status === "string" ? s.status : "";
        return (
          <li
            key={String(s.id)}
            className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"
          >
            <Bot
              className="mt-0.5 size-4 shrink-0 text-zinc-400"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTimeZh(s.started_at as string | undefined)}
                </span>
                {status ? (
                  <span className="text-xs text-zinc-400">· {status}</span>
                ) : null}
              </div>
              <p className="truncate font-medium">{title}</p>
            </div>
          </li>
        );
      })}
      <li>
        <Link
          to="/ai-sessions"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          查看全部 AI 日志 →
        </Link>
      </li>
    </ul>
  );
}
