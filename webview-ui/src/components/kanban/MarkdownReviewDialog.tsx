/**
 * 只读 Markdown 详情弹窗（影响分析 / 测试用例派生报告等）。
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DataFreshness } from "@/types/observatory";

type Props = {
  open: boolean;
  title: string;
  markdownContent: string;
  freshness?: DataFreshness;
  onClose: () => void;
};

export function MarkdownReviewDialog({
  open,
  title,
  markdownContent,
  freshness,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const stale = freshness === "stale";

  const node = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="md-review-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,40rem)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl dark:border-zinc-600 dark:bg-[#2a2a3c] dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
          <h2
            id="md-review-dialog-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            关闭
          </button>
        </div>
        {stale ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
            当前报告基于旧代码状态生成，建议重新执行上游分析步骤。
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <article className="markdown-review text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:max-h-64 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-zinc-100 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs dark:[&_pre]:bg-zinc-900/70 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdownContent || "（无内容）"}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
