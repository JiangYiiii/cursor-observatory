/**
 * 会话详情：摘要、能力、消息时间线（若接口返回 messages）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.7, docs/SCHEMA_SPEC.md §十二-B
 */
import { Bot, MessageSquare, User, X } from "lucide-react";
import { Badge } from "@/components/common";
import { formatDateTimeZhFull } from "@/lib/format-time";
import type { SessionDetail as SessionDetailType } from "@/types/observatory";
import { SessionArtifacts } from "./SessionArtifacts";

type Msg = {
  role?: string;
  content?: string;
  timestamp?: string;
};

function extractMessages(d: SessionDetailType | null): Msg[] {
  if (!d) return [];
  const m = d.messages;
  if (Array.isArray(m)) return m as Msg[];
  const t = d.transcript;
  if (Array.isArray(t)) return t as Msg[];
  return [];
}

type Props = {
  detail: SessionDetailType | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export function SessionDetail({ detail, loading, error, onClose }: Props) {
  if (loading) {
    return (
      <aside className="flex w-full shrink-0 flex-col rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c] lg:w-[420px]">
        <p className="text-sm text-zinc-500">加载详情…</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="flex w-full shrink-0 flex-col rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/30 lg:w-[420px]">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="w-full shrink-0 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400 lg:w-[420px]">
        选择左侧会话查看详情与消息时间线
      </aside>
    );
  }

  const title = String(detail.title ?? detail.id ?? "会话");
  const caps = (detail.capability_ids as string[] | undefined) ?? [];
  const tags = (detail.tags as string[] | undefined) ?? [];
  const files = (detail.files_touched as string[] | undefined) ?? [];
  const artifacts = (detail.artifacts as Array<Record<string, unknown>> | undefined) ?? [];
  const messages = extractMessages(detail);

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#2a2a3c] lg:w-[420px]">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{String(detail.id)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {detail.status ? (
              <Badge variant="neutral" className="text-[10px]">
                {String(detail.status)}
              </Badge>
            ) : null}
            {detail.type ? (
              <Badge variant="neutral" className="text-[10px]">
                {String(detail.type)}
              </Badge>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[min(78vh,720px)] flex-1 overflow-y-auto p-3 text-sm">
        <dl className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
          {detail.project ? (
            <div>
              <dt className="text-zinc-500">项目</dt>
              <dd className="font-mono">{String(detail.project)}</dd>
            </div>
          ) : null}
          {detail.created_at ? (
            <div>
              <dt className="text-zinc-500">创建</dt>
              <dd>{formatDateTimeZhFull(String(detail.created_at))}</dd>
            </div>
          ) : null}
          {detail.updated_at ? (
            <div>
              <dt className="text-zinc-500">更新</dt>
              <dd>{formatDateTimeZhFull(String(detail.updated_at))}</dd>
            </div>
          ) : null}
        </dl>

        {typeof detail.summary === "string" && detail.summary.length > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
            {detail.summary}
          </p>
        ) : null}

        {caps.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-[10px] font-medium uppercase text-zinc-500">
              能力
            </p>
            <div className="flex flex-wrap gap-1">
              {caps.map((id) => (
                <Badge key={id} variant="neutral" className="font-mono text-[10px]">
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
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

        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-700">
          <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            <MessageSquare className="size-3.5" aria-hidden />
            消息时间线
          </h4>
          {messages.length === 0 ? (
            <p className="text-xs text-zinc-500">
              未返回 messages / transcript 数组时，仅展示 meta 与产物。完整对话可在
              Extension 侧解析 transcript。
            </p>
          ) : (
            <ul className="space-y-3">
              {messages.map((msg, i) => {
                const role = String(msg.role ?? "unknown").toLowerCase();
                const isUser = role === "user" || role === "human";
                return (
                  <li
                    key={i}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${
                      isUser
                        ? "border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50"
                        : "border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/30"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                      {isUser ? (
                        <User className="size-3" aria-hidden />
                      ) : (
                        <Bot className="size-3" aria-hidden />
                      )}
                      <span>{msg.role ?? "message"}</span>
                      {msg.timestamp ? (
                        <span className="ml-auto">
                          {formatDateTimeZhFull(msg.timestamp)}
                        </span>
                      ) : null}
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-sans text-zinc-800 dark:text-zinc-100">
                      {msg.content ?? "—"}
                    </pre>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-700">
          <SessionArtifacts
            filesTouched={files}
            artifacts={artifacts as { type?: string; path?: string; timestamp?: string }[]}
          />
        </div>
      </div>
    </aside>
  );
}
