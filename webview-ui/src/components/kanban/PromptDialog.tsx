/**
 * Prompt 弹窗：Portal + fixed（Webview 内原生 dialog 可能不可用）。
 */
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { copyToClipboard } from "@/lib/clipboard";

type Props = {
  open: boolean;
  title: string;
  prompt: string;
  onClose: () => void;
  /** 显示在 Prompt 上方的可选控件（如 Bug 描述输入） */
  children?: ReactNode;
};

export function PromptDialog({ open, title, prompt, onClose, children }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [prompt]);

  if (!open || typeof document === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(90vh,720px)] w-[min(100vw-2rem,36rem)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl dark:border-zinc-600 dark:bg-[#2a2a3c] dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
          <h2
            id="prompt-dialog-title"
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
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {children ? <div className="mb-3 space-y-2">{children}</div> : null}
          {children ? (
            <p className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              下方为只读生成的完整 Prompt；请在上方的输入框中填写或粘贴需求描述。
            </p>
          ) : (
            <p className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              以下为只读生成的完整 Prompt；点击文本可选中复制，或使用「复制到剪贴板」。
            </p>
          )}
          <pre
            className="h-64 max-h-[min(50vh,24rem)] w-full cursor-text select-text overflow-auto whitespace-pre-wrap break-words rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-200"
            tabIndex={0}
            onClick={(e) => {
              const sel = window.getSelection();
              if (!sel) return;
              const range = document.createRange();
              range.selectNodeContents(e.currentTarget);
              sel.removeAllRanges();
              sel.addRange(range);
            }}
          >
            {prompt}
          </pre>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 sm:w-auto"
          >
            {copied ? (
              <>
                <Check className="size-3.5" />
                已复制
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                复制到剪贴板
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
