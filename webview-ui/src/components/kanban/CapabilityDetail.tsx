/**
 * 能力详情弹窗（点击看板卡片打开）。
 * 使用 Portal + fixed 层，避免在 VS Code Webview 中原生 <dialog> 不显示的问题。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.3, docs/SCHEMA_SPEC.md §四
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Check, Copy, Hash, Percent, X } from "lucide-react";
import { Badge } from "@/components/common";
import {
  getCapabilityUpdatedIso,
  normalizePhase,
  PHASE_TITLE,
} from "@/lib/kanban-utils";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDateTimeZhFull } from "@/lib/format-time";
import type { Capability } from "@/types/observatory";

type Props = {
  capability: Capability;
  onClose: () => void;
};

const META_KEYS = new Set([
  "id",
  "title",
  "phase",
  "progress",
  "updatedAt",
  "updated_at",
  "schema_version",
  "sdd",
  "bugfix",
]);

export function buildAiContextMarkdown(
  cap: Capability,
  phaseLabel: string,
  extra: [string, unknown][]
): string {
  const lines: string[] = [
    "# Observatory 能力上下文",
    "",
    "## 基本信息",
    `- **能力 ID**: \`${cap.id}\``,
    `- **标题**: ${String(cap.title ?? cap.id)}`,
    `- **阶段**: ${phaseLabel}`,
  ];
  const iso = getCapabilityUpdatedIso(cap);
  lines.push(`- **最后更新**: ${iso ? formatDateTimeZhFull(iso) : "未知"}`);
  if (typeof cap.progress === "number") {
    lines.push(
      `- **进度**: ${Math.round(Math.min(100, Math.max(0, cap.progress)))}%`
    );
  }
  lines.push("", "## 扩展字段");
  if (extra.length === 0) {
    lines.push("（无）");
  } else {
    for (const [k, v] of extra) {
      const val =
        typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
      lines.push(`- **${k}**: ${val}`);
    }
  }
  lines.push("", "## 原始 JSON（供 AI 解析）", "", "```json");
  lines.push(JSON.stringify(cap, null, 2));
  lines.push("```");
  return lines.join("\n");
}

export function CapabilityDetail({ capability: cap, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const phase = normalizePhase(cap.phase);
  const phaseLabel = PHASE_TITLE[phase];

  const extra = useMemo(
    () =>
      Object.entries(cap).filter(
        ([k, v]) => !META_KEYS.has(k) && v !== undefined && v !== null
      ),
    [cap]
  );

  const aiText = useMemo(
    () => buildAiContextMarkdown(cap, phaseLabel, extra),
    [cap, phaseLabel, extra]
  );

  const updatedIso = getCapabilityUpdatedIso(cap);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(aiText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [aiText]);

  const node = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cap-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(90vh,640px)] w-[min(100vw-2rem,28rem)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl dark:border-zinc-600 dark:bg-[#2a2a3c] dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
          <div className="min-w-0">
            <h3
              id="cap-detail-title"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {String(cap.title ?? cap.id)}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Hash className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate font-mono">{cap.id}</span>
            </p>
            {updatedIso ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                更新于 {formatDateTimeZhFull(updatedIso)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="关闭详情"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{phaseLabel}</Badge>
            {typeof cap.progress === "number" ? (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                <Percent className="size-3.5" aria-hidden />
                {Math.round(Math.min(100, Math.max(0, cap.progress)))}%
              </span>
            ) : null}
          </div>

          {typeof cap.progress === "number" ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{
                  width: `${Math.round(Math.min(100, Math.max(0, cap.progress)))}%`,
                }}
              />
            </div>
          ) : null}

          {cap.sdd?.enabled ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50/80 px-2 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
              <p className="mb-1.5 font-medium text-amber-900 dark:text-amber-100">
                SDD 产物
              </p>
              <p className="mb-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                {cap.sdd.workspacePath}
              </p>
              {cap.sdd.specAuthor ? (
                <p className="mb-1.5 text-[10px] text-zinc-700 dark:text-zinc-300">
                  Spec 创建者：{" "}
                  <span className="font-medium">{cap.sdd.specAuthor}</span>
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-700 dark:text-zinc-300">
                {(
                  [
                    ["spec.md", cap.sdd.documents.spec],
                    ["sketch.md", cap.sdd.documents.sketch],
                    ["plan.md", cap.sdd.documents.plan],
                    ["tasks.md", cap.sdd.documents.tasks],
                    ["data-model.md", cap.sdd.documents.dataModel],
                    ["contracts/", cap.sdd.documents.contracts],
                    ["research.md", cap.sdd.documents.research],
                  ] as const
                ).map(([label, ok]) => (
                  <span key={label}>
                    {ok ? "✅" : "❌"} {label}
                  </span>
                ))}
              </div>
              {cap.sdd.taskStats ? (
                <p className="mt-2 text-[10px] text-zinc-600 dark:text-zinc-400">
                  任务进度：{cap.sdd.taskStats.completed}/
                  {cap.sdd.taskStats.total}
                </p>
              ) : null}
              {cap.sdd.phaseDeclaredInObservatorySdd ? (
                <p className="mt-2 text-[10px] text-sky-800 dark:text-sky-200">
                  阶段由 observatory-sdd.json 的 declaredPhase 声明（全量扫描保留）
                </p>
              ) : null}
              {cap.sdd.skipTestingAfterTasks ? (
                <p className="mt-2 text-[10px] text-emerald-800 dark:text-emerald-200">
                  已声明：任务完成后无需单独测试阶段（全量扫描可直接标「已完成」）
                </p>
              ) : null}
              {cap.sdd.activeFeature ? (
                <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                  当前为 specs/.active 指向的活跃 feature
                </p>
              ) : null}
            </div>
          ) : null}

          {cap.bugfix &&
          (cap.bugfix.activeBugs > 0 || cap.bugfix.resolvedBugs > 0) ? (
            <div className="mt-4 rounded border border-red-200 bg-red-50/80 px-2 py-2 text-xs dark:border-red-800/60 dark:bg-red-950/20">
              <p className="mb-1 font-medium text-red-900 dark:text-red-100">
                Bug 状态
              </p>
              <p className="text-[10px] text-zinc-700 dark:text-zinc-300">
                未关闭：{cap.bugfix.activeBugs} · 已关闭：
                {cap.bugfix.resolvedBugs}
              </p>
              {cap.bugfix.rootCauses?.length ? (
                <p className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-400">
                  未关根因：{cap.bugfix.rootCauses.join(", ")}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-zinc-500">
                详见 {cap.sdd?.workspacePath ?? "specs/<feature>"}/bugfix-log.md
              </p>
            </div>
          ) : null}

          {extra.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                <Box className="size-3.5" aria-hidden />
                扩展字段
              </p>
              <dl className="space-y-2 text-xs">
                {extra.map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50"
                  >
                    <dt className="font-mono text-zinc-500">{k}</dt>
                    <dd className="mt-0.5 break-all text-zinc-800 dark:text-zinc-200">
                      {typeof v === "object"
                        ? JSON.stringify(v, null, 0)
                        : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-700">
            <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              给 AI 的上下文（可复制到对话里）
            </p>
            <textarea
              readOnly
              value={aiText}
              className="h-40 w-full resize-y rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-200"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
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
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
