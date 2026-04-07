/**
 * 需求链接（observatory-sdd.json requirementUrl）
 */
import { useCallback, useState } from "react";
import { Check, Copy, GitBranch, Pencil, ScrollText } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

type Props = {
  requirementUrl: string;
  busy: boolean;
  onSave: (next: string) => Promise<void>;
  /** TAPD 链接时展示：复制 AI 指令以拉取详情 / 走 Cheetah+Git 分支 */
  showTapdActions?: boolean;
  onCopyTapdFetchPrompt?: () => void | Promise<void>;
  onCopyBranchWorkflowPrompt?: () => void | Promise<void>;
};

export function RequirementUrlCard({
  requirementUrl,
  busy,
  onSave,
  showTapdActions = false,
  onCopyTapdFetchPrompt,
  onCopyBranchWorkflowPrompt,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(requirementUrl);
  const [copied, setCopied] = useState(false);
  const [tapdCopied, setTapdCopied] = useState<"story" | "branch" | null>(null);

  const display = requirementUrl.trim();
  const syncDraft = useCallback(() => {
    setDraft(requirementUrl);
  }, [requirementUrl]);

  const handleEdit = () => {
    syncDraft();
    setEditing(true);
  };

  const handleSave = async () => {
    await onSave(draft.trim());
    setEditing(false);
  };

  const handleCopy = async () => {
    if (!display) return;
    const ok = await copyToClipboard(display);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const runTapd = async (
    kind: "story" | "branch",
    fn?: () => void | Promise<void>
  ) => {
    if (!fn) return;
    await fn();
    setTapdCopied(kind);
    window.setTimeout(() => setTapdCopied(null), 2000);
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          需求链接
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {display && !editing ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              复制
            </button>
          ) : null}
          {showTapdActions && display && !editing ? (
            <>
              <button
                type="button"
                title="复制到剪贴板，粘贴到 Cursor Chat：由 AI 调用 TAPD MCP 拉取需求详情"
                onClick={() =>
                  void runTapd("story", onCopyTapdFetchPrompt)
                }
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
              >
                {tapdCopied === "story" ? (
                  <Check className="size-3" />
                ) : (
                  <ScrollText className="size-3" />
                )}
                TAPD 详情
              </button>
              <button
                type="button"
                title="复制 AI 指令：Cheetah MCP 建分支 + git pull/checkout"
                onClick={() =>
                  void runTapd("branch", onCopyBranchWorkflowPrompt)
                }
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              >
                {tapdCopied === "branch" ? (
                  <Check className="size-3" />
                ) : (
                  <GitBranch className="size-3" />
                )}
                分支工作流
              </button>
            </>
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
            >
              <Pencil className="size-3" />
              编辑
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSave()}
                className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  syncDraft();
                }}
                className="text-[10px] text-zinc-500 hover:underline"
              >
                取消
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 font-mono text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      ) : display ? (
        <p className="truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-200" title={display}>
          {display}
        </p>
      ) : (
        <p className="text-[11px] text-zinc-500">
          尚未配置需求链接。点击「编辑」填写 Jira/TAPD/文档 URL，便于提交说明与部署 Prompt 引用。
        </p>
      )}
    </section>
  );
}
