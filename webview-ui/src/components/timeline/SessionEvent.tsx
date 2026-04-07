/**
 * ai-sessions.json 单条会话卡片（文件/文档/测试摘要）。
 * primary_doc: docs/SCHEMA_SPEC.md §九, docs/FRONTEND_DESIGN.md §4.5
 */
import {
  Bot,
  FileEdit,
  FileText,
  FlaskConical,
  Link2,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/common";
import { formatDateTimeZhFull } from "@/lib/format-time";
import { formatSessionDisplayTitle } from "@/lib/session-display-title";
import type { AiSession } from "@/types/observatory";

type Props = {
  session: AiSession;
};

export function SessionEvent({ session: s }: Props) {
  const files = s.files_modified ?? [];
  const docs = s.docs_updated ?? [];
  const tests = s.tests_run as
    | { total?: number; passed?: number; failed?: number }
    | undefined;
  const tags = s.tags ?? [];
  const caps = s.capability_ids ?? [];

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-[#32324a]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTimeZhFull(s.started_at as string | undefined)}
            {s.ended_at ? (
              <span className="text-zinc-400">
                {" "}
                → {formatDateTimeZhFull(s.ended_at as string | undefined)}
              </span>
            ) : null}
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <Bot className="size-4 shrink-0 text-violet-500" aria-hidden />
            <span
              className="min-w-0"
              title={
                typeof s.title === "string" && s.title.trim().length > 0
                  ? s.title.trim()
                  : s.id
              }
            >
              {formatSessionDisplayTitle(s.title, s.id)}
            </span>
          </h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {s.type ? (
            <Badge variant="neutral" className="text-[10px]">
              {s.type}
            </Badge>
          ) : null}
          {s.status ? (
            <Badge
              variant={
                s.status === "completed"
                  ? "success"
                  : s.status === "failed"
                    ? "danger"
                    : "warning"
              }
              className="text-[10px]"
            >
              {s.status}
            </Badge>
          ) : null}
        </div>
      </div>

      {typeof s.duration_minutes === "number" ? (
        <p className="mt-1 text-xs text-zinc-500">
          耗时约 {s.duration_minutes} 分钟
        </p>
      ) : null}

      {caps.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <Link2 className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
          {caps.map((id) => (
            <Badge key={id} variant="neutral" className="font-mono text-[10px]">
              {id}
            </Badge>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Tag className="size-3.5 text-zinc-400" aria-hidden />
          {tags.map((t) => (
            <span
              key={t}
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {typeof s.summary === "string" && s.summary.length > 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {s.summary}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <FileEdit className="size-3.5" aria-hidden />
            文件变更
          </p>
          <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
            {files.map((f, i) => (
              <li
                key={`${f.path}-${i}`}
                className="rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1 font-mono dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <span className="text-emerald-600 dark:text-emerald-400">
                  {f.action ?? "changed"}
                </span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">{f.path}</span>
                {(f.lines_added != null || f.lines_removed != null) && (
                  <span className="ml-1 tabular-nums text-zinc-500">
                    +{f.lines_added ?? 0} / -{f.lines_removed ?? 0}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {docs.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <FileText className="size-3.5" aria-hidden />
            文档更新
          </p>
          <ul className="space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {docs.map((d) => (
              <li key={d} className="truncate font-mono">
                {d}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tests &&
      (tests.total != null || tests.passed != null || tests.failed != null) ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <FlaskConical className="size-3.5 text-zinc-500" aria-hidden />
          <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
            测试 {tests.passed ?? 0}/{tests.total ?? "?"} 通过
            {tests.failed != null && tests.failed > 0 ? (
              <span className="ml-1 text-red-600 dark:text-red-400">
                （失败 {tests.failed}）
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {typeof s.transcript_file === "string" ? (
        <p className="mt-2 truncate font-mono text-[10px] text-zinc-400">
          transcript: {s.transcript_file}
        </p>
      ) : null}
    </article>
  );
}
