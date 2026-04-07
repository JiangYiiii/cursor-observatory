/**
 * 右列：需求详情 + SDD Prompt 操作。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildAiContextMarkdown } from "@/components/kanban/CapabilityDetail";
import {
  getCapabilityUpdatedIso,
  normalizePhase,
  PHASE_TITLE,
} from "@/lib/kanban-utils";
import { formatDateTimeZhFull } from "@/lib/format-time";
import {
  formatTestSummaryForPrompt,
  generateAdvancePrompt,
  generateAnalyzePrompt,
  generateBugfixPrompt,
  generateImplementPrompt,
  generatePlanPrompt,
  generateReleasePrompt,
  generateTasksPrompt,
  generateTestPrompt,
} from "@/lib/prompt-generators";
import {
  getRelatedActivities,
  getTestStatsForCapability,
  resolveAdvanceKind,
} from "@/lib/requirement-utils";
import type {
  AiSession,
  Capability,
  Progress,
  TestExpectations,
  TestResults,
} from "@/types/observatory";
import { Check, Copy, Hash, RefreshCw } from "lucide-react";
import { sddFeatureDirName } from "@/lib/sdd-utils";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import { copyToClipboard } from "@/lib/clipboard";
import { PhaseBadge } from "./PhaseBadge";
import { PromptDialog } from "./PromptDialog";

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

type Props = {
  capability: Capability | null;
  testResults: TestResults | null;
  testExpectations: TestExpectations | null;
  progress: Progress | null;
  aiSessions: AiSession[];
};

export function RequirementDetail({
  capability: cap,
  testResults,
  testExpectations,
  progress,
  aiSessions,
}: Props) {
  const refresh = useObservatoryStore((s) => s.refresh);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogPrompt, setDialogPrompt] = useState("");
  const [bugDraft, setBugDraft] = useState("");
  const [ctxCopied, setCtxCopied] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  useEffect(() => {
    setSyncErr(null);
  }, [cap?.id]);

  const testStats = useMemo(() => {
    if (!cap) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        scenarioExpected: 0,
        scenarioCovered: 0,
      };
    }
    return getTestStatsForCapability(cap.id, testResults, testExpectations);
  }, [cap, testResults, testExpectations]);

  const testSummaryLine = useMemo(() => {
    if (!cap) return "";
    return formatTestSummaryForPrompt(
      cap.id,
      testStats.total,
      testStats.passed,
      testStats.failed,
      testStats.scenarioExpected,
      testStats.scenarioCovered
    );
  }, [cap, testStats]);

  const activities = useMemo(() => {
    if (!cap) return [];
    return getRelatedActivities(cap.id, progress, aiSessions, 5);
  }, [cap, progress, aiSessions]);

  const extra = useMemo(
    () =>
      cap
        ? Object.entries(cap).filter(
            ([k, v]) => !META_KEYS.has(k) && v !== undefined && v !== null
          )
        : [],
    [cap]
  );

  const aiContextText = useMemo(() => {
    if (!cap) return "";
    const phaseLabel = PHASE_TITLE[normalizePhase(cap.phase)];
    return buildAiContextMarkdown(cap, phaseLabel, extra);
  }, [cap, extra]);

  const openPrompt = useCallback((title: string, prompt: string) => {
    setDialogTitle(title);
    setDialogPrompt(prompt);
    setDialogOpen(true);
  }, []);

  const handleSyncSdd = useCallback(async () => {
    if (!cap?.sdd?.enabled) return;
    const dir = sddFeatureDirName(cap);
    if (!dir) return;
    setSyncBusy(true);
    setSyncErr(null);
    try {
      await getDataSource().scanSddFeature(dir);
      await refresh("capabilities");
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }, [cap, refresh]);

  const handleCopyContext = useCallback(async () => {
    if (!aiContextText) return;
    const ok = await copyToClipboard(aiContextText);
    if (ok) {
      setCtxCopied(true);
      window.setTimeout(() => setCtxCopied(false), 2000);
    }
  }, [aiContextText]);

  if (!cap) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/20 dark:text-zinc-400">
        点击左侧需求查看详情与 SDD 操作
      </div>
    );
  }

  const d = cap.sdd?.documents;
  const ts = cap.sdd?.taskStats;
  const phase = normalizePhase(cap.phase);

  const showPlan = Boolean(d?.spec && !d?.plan);
  const showTasks = Boolean(d?.plan && !d?.tasks);
  const showImplement = Boolean(
    d?.tasks && ts && ts.total > 0 && ts.completed < ts.total
  );
  const showTest = Boolean(
    phase === "testing" ||
      (d?.tasks && ts && ts.total > 0 && ts.completed >= ts.total)
  );
  const showAnalyze = Boolean(d?.spec && d?.plan && d?.tasks);
  const advanceKind = resolveAdvanceKind(cap);

  const docRow = d ? (
    <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-700 dark:text-zinc-300 sm:grid-cols-4">
      <span>{d.spec ? "✅" : "❌"} spec</span>
      <span>{d.sketch ? "✅" : "❌"} sketch</span>
      <span>{d.plan ? "✅" : "❌"} plan</span>
      <span>{d.tasks ? "✅" : "❌"} tasks</span>
      <span>{d.dataModel ? "✅" : "❌"} data-model</span>
      <span>{d.contracts ? "✅" : "❌"} contracts</span>
      <span>{d.research ? "✅" : "❌"} research</span>
    </div>
  ) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <header className="space-y-2 border-b border-zinc-100 pb-3 dark:border-zinc-700">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {String(cap.title ?? cap.id)}
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <Hash className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate font-mono">{cap.id}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PhaseBadge phase={cap.phase} />
                {getCapabilityUpdatedIso(cap) ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    更新{" "}
                    {formatDateTimeZhFull(getCapabilityUpdatedIso(cap) ?? "")}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  openPrompt(
                    "推进需求",
                    generateAdvancePrompt(cap, testSummaryLine)
                  )
                }
                className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
              >
                推进需求
              </button>
              <button
                type="button"
                onClick={() => void handleCopyContext()}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {ctxCopied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                复制上下文
              </button>
              {showAnalyze ? (
                <button
                  type="button"
                  onClick={() =>
                    openPrompt("产物分析", generateAnalyzePrompt(cap))
                  }
                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  产物分析
                </button>
              ) : null}
              {advanceKind === "release" || phase === "completed" ? (
                <button
                  type="button"
                  onClick={() =>
                    openPrompt("标记已发布", generateReleasePrompt(cap))
                  }
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  发布说明
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {cap.sdd?.enabled ? (
          <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-600 dark:bg-zinc-900/30">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                SDD 产物
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                {sddFeatureDirName(cap) ? (
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={() => void handleSyncSdd()}
                    title="仅重新扫描本需求对应 specs 目录并更新看板（不跑全量架构/Git 扫描）"
                    className="inline-flex items-center gap-1 rounded bg-zinc-200/80 px-2 py-1 text-[10px] font-medium text-zinc-800 hover:bg-zinc-300/90 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
                  >
                    <RefreshCw
                      className={`size-3 ${syncBusy ? "animate-spin" : ""}`}
                      aria-hidden
                    />
                    同步
                  </button>
                ) : null}
                {showPlan ? (
                  <button
                    type="button"
                    onClick={() =>
                      openPrompt("设计方案", generatePlanPrompt(cap))
                    }
                    className="rounded bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    设计方案
                  </button>
                ) : null}
                {showTasks ? (
                  <button
                    type="button"
                    onClick={() =>
                      openPrompt("拆解任务", generateTasksPrompt(cap))
                    }
                    className="rounded bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    拆解任务
                  </button>
                ) : null}
              </div>
            </div>
            {syncErr ? (
              <p className="mb-2 text-[10px] text-red-600 dark:text-red-400">
                {syncErr}
              </p>
            ) : null}
            <p className="mb-2 font-mono text-[10px] text-zinc-500">
              {cap.sdd.workspacePath}
            </p>
            {cap.sdd.specAuthor ? (
              <p className="mb-2 text-[10px] text-zinc-600 dark:text-zinc-400">
                Spec 创建者：{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {cap.sdd.specAuthor}
                </span>
              </p>
            ) : null}
            {docRow}
            {cap.sdd.phaseDeclaredInObservatorySdd ? (
              <p className="mt-2 text-[10px] text-sky-800 dark:text-sky-200">
                阶段由 observatory-sdd.json 的 declaredPhase 声明（全量扫描保留）
              </p>
            ) : null}
            {cap.sdd.skipTestingAfterTasks ? (
              <p className="mt-2 text-[10px] text-emerald-800 dark:text-emerald-200">
                已声明：任务完成后跳过单独测试阶段
              </p>
            ) : null}
          </section>
        ) : null}

        {ts && ts.total > 0 ? (
          <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                开发任务
              </h3>
              {showImplement ? (
                <button
                  type="button"
                  onClick={() =>
                    openPrompt("继续开发", generateImplementPrompt(cap))
                  }
                  className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-700"
                >
                  继续开发
                </button>
              ) : null}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-violet-500 transition-[width]"
                style={{
                  width: `${Math.round((ts.completed / Math.max(ts.total, 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              {ts.completed}/{ts.total} 已完成
            </p>
          </section>
        ) : null}

        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              测试状态
            </h3>
            {showTest ? (
              <button
                type="button"
                onClick={() =>
                  openPrompt("执行测试", generateTestPrompt(cap, testSummaryLine))
                }
                className="rounded-md bg-orange-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-orange-700"
              >
                执行测试
              </button>
            ) : null}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            用例：通过 {testStats.passed} / 失败 {testStats.failed} / 总计{" "}
            {testStats.total}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            场景覆盖：{testStats.scenarioCovered}/{testStats.scenarioExpected}
          </p>
        </section>

        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Bug 追踪
            </h3>
            <button
              type="button"
              onClick={() =>
                openPrompt(
                  "Bug 修复",
                  generateBugfixPrompt(cap, bugDraft.trim() || undefined)
                )
              }
              className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700"
            >
              Bug 修复
            </button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            未关闭：{cap.bugfix?.activeBugs ?? 0} · 已关闭：
            {cap.bugfix?.resolvedBugs ?? 0}
          </p>
          {cap.bugfix?.rootCauses?.length ? (
            <p className="mt-1 text-[10px] text-zinc-500">
              根因：{cap.bugfix.rootCauses.join(", ")}
            </p>
          ) : null}
          <label className="mt-2 block text-[10px] text-zinc-500">
            新 Bug 描述（可选；留空则按 bugfix-log 中 OPEN 项修复）
            <textarea
              value={bugDraft}
              onChange={(e) => setBugDraft(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-zinc-200 bg-white p-1.5 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              placeholder="现象、复现步骤…"
            />
          </label>
        </section>

        {activities.length > 0 ? (
          <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
            <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              相关活动
            </h3>
            <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
              {activities.map((a) => (
                <li key={a.id} className="border-l-2 border-zinc-200 pl-2 dark:border-zinc-600">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {a.kind === "session" ? "会话" : "记录"} · {a.title}
                  </span>
                  {a.subtitle ? (
                    <span className="ml-1 text-[10px] text-zinc-400">
                      {a.subtitle}
                    </span>
                  ) : null}
                  <div className="text-[10px] text-zinc-400">
                    {formatDateTimeZhFull(a.timestamp)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <PromptDialog
        open={dialogOpen}
        title={dialogTitle}
        prompt={dialogPrompt}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
