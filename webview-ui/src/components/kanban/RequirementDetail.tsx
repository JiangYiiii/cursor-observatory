/**
 * 右列：需求详情 + SDD Prompt 操作（V2 卡片编排）。
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
  computeImpactFreshness,
  computeTestCasesFreshness,
} from "@/lib/impact-freshness";
import {
  formatTestSummaryForPrompt,
  generateAdvancePrompt,
  generateAnalyzePrompt,
  generateBugfixPrompt,
  generateCheetahBranchWorkflowPrompt,
  generateCodeSubmitPrompt,
  generateDeployPrompt,
  generateImpactAnalysisPrompt,
  generateImplementPrompt,
  generatePlanPrompt,
  generateReleasePrompt,
  generateTapdStoryFetchPrompt,
  generateTasksPrompt,
  generateTestCasesPrompt,
  generateTestPrompt,
} from "@/lib/prompt-generators";
import {
  getRelatedActivities,
  getTestStatsForCapability,
  isTapdRequirementUrl,
  mergeDeployServiceDisplayLine,
  resolveAdvanceKind,
} from "@/lib/requirement-utils";
import type {
  AiSession,
  Capability,
  DataFreshness,
  Progress,
  TestExpectations,
  TestResults,
} from "@/types/observatory";
import type { PreflightResult } from "@/types/observatory";
import { Check, Copy, Hash } from "lucide-react";
import { sddFeatureDirName } from "@/lib/sdd-utils";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import { copyToClipboard } from "@/lib/clipboard";
import { PhaseBadge } from "./PhaseBadge";
import { PromptDialog } from "./PromptDialog";
import { MarkdownReviewDialog } from "./MarkdownReviewDialog";
import {
  ActivityCard,
  BugTrackingCard,
  CodeSubmitCard,
  DeployCard,
  DevTasksCard,
  ImpactAnalysisCard,
  RequirementUrlCard,
  SddArtifactsCard,
  TestCasesCard,
  UtTestCard,
} from "./cards";

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
  const loadRequirementPanel = useObservatoryStore(
    (s) => s.loadRequirementPanel
  );
  const clearRequirementPanel = useObservatoryStore(
    (s) => s.clearRequirementPanel
  );
  const saveSddConfigPartial = useObservatoryStore(
    (s) => s.saveSddConfigPartial
  );
  const sddConfig = useObservatoryStore((s) => s.sddConfig);
  const impactAnalysis = useObservatoryStore((s) => s.impactAnalysis);
  const testCases = useObservatoryStore((s) => s.testCases);
  const gitInfo = useObservatoryStore((s) => s.gitInfo);
  const requirementPanelLoading = useObservatoryStore(
    (s) => s.requirementPanelLoading
  );
  const requirementPanelFeature = useObservatoryStore(
    (s) => s.requirementPanelFeature
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogPrompt, setDialogPrompt] = useState("");
  const [bugDraft, setBugDraft] = useState("");
  const [ctxCopied, setCtxCopied] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [swimlaneDraft, setSwimlaneDraft] = useState("");
  const [deployServicesDraft, setDeployServicesDraft] = useState("");
  const [deploySettings, setDeploySettings] = useState<{
    defaultServiceList: string;
    cheetahMcpService: string;
  }>({ defaultServiceList: "", cheetahMcpService: "" });
  const [sddSaveBusy, setSddSaveBusy] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [mdOpen, setMdOpen] = useState(false);
  const [mdTitle, setMdTitle] = useState("");
  const [mdContent, setMdContent] = useState("");
  const [mdFreshness, setMdFreshness] = useState<DataFreshness | undefined>();

  const feature = cap ? sddFeatureDirName(cap) : null;

  useEffect(() => {
    setSyncErr(null);
  }, [cap?.id]);

  useEffect(() => {
    if (!cap?.sdd?.enabled || !feature) {
      clearRequirementPanel();
      setSwimlaneDraft("");
      return;
    }
    void loadRequirementPanel(feature);
  }, [cap?.id, cap?.sdd?.enabled, cap?.sdd?.workspacePath, feature, loadRequirementPanel, clearRequirementPanel]);

  useEffect(() => {
    const sl =
      typeof sddConfig?.swimlane === "string" ? sddConfig.swimlane : "";
    setSwimlaneDraft(sl);
  }, [sddConfig?.swimlane, requirementPanelFeature, feature]);

  useEffect(() => {
    const raw =
      typeof sddConfig?.deployServiceList === "string"
        ? sddConfig.deployServiceList
        : "";
    setDeployServicesDraft(raw);
  }, [sddConfig?.deployServiceList, requirementPanelFeature, feature]);

  useEffect(() => {
    let cancelled = false;
    void getDataSource()
      .getDeploySettings()
      .then((d) => {
        if (!cancelled) setDeploySettings(d);
      })
      .catch(() => {
        if (!cancelled) {
          setDeploySettings({
            defaultServiceList: "",
            cheetahMcpService: "",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPreflight(null);
    void getDataSource()
      .getPreflight("impact-analysis")
      .then((r) => {
        if (!cancelled) setPreflight(r);
      })
      .catch(() => {
        if (!cancelled) setPreflight(null);
      });
    return () => {
      cancelled = true;
    };
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

  const impactScenariosBlock = useMemo(() => {
    const ia = impactAnalysis;
    if (!ia?.scenarios?.length) return undefined;
    return ia.scenarios
      .map(
        (s) =>
          `- **${s.id}** (${s.impact}) ${s.name}${s.description ? ` — ${s.description}` : ""}`
      )
      .join("\n");
  }, [impactAnalysis]);

  const activities = useMemo(() => {
    if (!cap) return [];
    return getRelatedActivities(cap.id, progress, aiSessions, 5).map((a) => ({
      id: a.id,
      kind: a.kind === "session" ? ("session" as const) : ("record" as const),
      title: a.title,
      subtitle: a.subtitle,
      timestamp: a.timestamp,
    }));
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

  const openPromptAsync = useCallback(
    async (title: string, gen: Promise<string>) => {
      try {
        const prompt = await gen;
        openPrompt(title, prompt);
      } catch (e) {
        openPrompt(
          title,
          `生成 Prompt 失败：${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    [openPrompt]
  );

  const reloadPanel = useCallback(async () => {
    if (feature) await loadRequirementPanel(feature);
  }, [feature, loadRequirementPanel]);

  const handleSyncSdd = useCallback(async () => {
    if (!cap?.sdd?.enabled) return;
    const dir = sddFeatureDirName(cap);
    if (!dir) return;
    setSyncBusy(true);
    setSyncErr(null);
    try {
      await getDataSource().scanSddFeature(dir);
      await refresh("capabilities");
      await reloadPanel();
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }, [cap, refresh, reloadPanel]);

  const handleCopyContext = useCallback(async () => {
    if (!aiContextText) return;
    const ok = await copyToClipboard(aiContextText);
    if (ok) {
      setCtxCopied(true);
      window.setTimeout(() => setCtxCopied(false), 2000);
    }
  }, [aiContextText]);

  const gitSnap = useMemo(() => {
    if (!gitInfo) return null;
    return {
      branch: gitInfo.branch,
      headCommit: gitInfo.headCommit,
      workingTreeFingerprint: gitInfo.workingTreeFingerprint,
    };
  }, [gitInfo]);

  const impactFreshness = useMemo(
    () => computeImpactFreshness(impactAnalysis, gitSnap),
    [impactAnalysis, gitSnap]
  );

  const testCasesFreshness = useMemo(
    () => computeTestCasesFreshness(testCases, impactAnalysis, gitSnap),
    [testCases, impactAnalysis, gitSnap]
  );

  const changedFilesHint = useMemo(() => {
    const files = impactAnalysis?.generated_from_changed_files;
    if (files?.length) {
      return files.map((f) => `- ${f}`).join("\n");
    }
    return "（扩展将在保存 JSON 时注入变更文件列表；若尚无文件列表，请结合当前 `git status` / `git diff` 分析。）";
  }, [impactAnalysis]);

  const affectedServicesLine = useMemo(() => {
    const mods = impactAnalysis?.affected_modules?.filter((m) => m.is_application);
    const names = mods?.length ? mods.map((m) => m.name) : undefined;
    return mergeDeployServiceDisplayLine(
      names,
      deployServicesDraft,
      deploySettings.defaultServiceList
    );
  }, [
    impactAnalysis,
    deployServicesDraft,
    deploySettings.defaultServiceList,
  ]);

  // 以下派生值在 cap 为空时亦需计算，以便其后 useCallback 与「无选中」渲染路径的 hooks 数量一致（Rules of Hooks）
  const d = cap?.sdd?.documents;
  const ts = cap?.sdd?.taskStats;
  const phase = normalizePhase(cap?.phase);

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
  const advanceKind = cap ? resolveAdvanceKind(cap) : ("implement" as const);

  const requirementUrl =
    typeof sddConfig?.requirementUrl === "string"
      ? sddConfig.requirementUrl
      : "";

  const cicd = preflight?.mcpStatus?.cicd;
  const lego = preflight?.mcpStatus?.testRunner;
  const cicdMcpStatus = cicd?.status === "configured" ? "configured" : (cicd?.status ?? "unknown");
  const cicdMcpInfo = cicd
    ? `${cicd.service ?? ""} · ${cicd.tool ?? ""}`
    : "";
  const legoMcpStatus = lego?.status === "configured" ? "configured" : (lego?.status ?? "unknown");
  const legoMcpInfo = lego
    ? `${lego.service ?? ""} · ${lego.tool ?? ""}`
    : "";

  const openImpactMd = useCallback(async () => {
    if (!feature) return;
    setMdTitle("影响分析（Markdown）");
    setMdFreshness(impactFreshness === "fresh" ? "fresh" : "stale");
    try {
      const md =
        (await getDataSource().getImpactAnalysisMd(feature)) ??
        "（暂无 impact-analysis.md）";
      setMdContent(md);
      setMdOpen(true);
    } catch {
      setMdContent("读取失败");
      setMdOpen(true);
    }
  }, [feature, impactFreshness]);

  const openTestCasesMd = useCallback(async () => {
    if (!feature) return;
    setMdTitle("测试用例（Markdown）");
    setMdFreshness(testCasesFreshness === "fresh" ? "fresh" : "stale");
    try {
      const md =
        (await getDataSource().getTestCasesMd(feature)) ??
        "（暂无 test-cases.md）";
      setMdContent(md);
      setMdOpen(true);
    } catch {
      setMdContent("读取失败");
      setMdOpen(true);
    }
  }, [feature, testCasesFreshness]);

  const handleSaveRequirementUrl = useCallback(
    async (next: string) => {
      if (!feature) return;
      await saveSddConfigPartial(feature, { requirementUrl: next });
    },
    [feature, saveSddConfigPartial]
  );

  const handleSaveSwimlaneBlur = useCallback(async () => {
    if (!feature) return;
    setSddSaveBusy(true);
    try {
      await saveSddConfigPartial(feature, { swimlane: swimlaneDraft.trim() });
    } finally {
      setSddSaveBusy(false);
    }
  }, [feature, saveSddConfigPartial, swimlaneDraft]);

  const handleSaveDeployServicesBlur = useCallback(async () => {
    if (!feature) return;
    setSddSaveBusy(true);
    try {
      await saveSddConfigPartial(feature, {
        deployServiceList: deployServicesDraft.trim(),
      });
    } finally {
      setSddSaveBusy(false);
    }
  }, [feature, saveSddConfigPartial, deployServicesDraft]);

  const handleCopyTapdFetchPrompt = useCallback(async () => {
    const u = requirementUrl.trim();
    if (!u) return;
    await copyToClipboard(generateTapdStoryFetchPrompt(u));
  }, [requirementUrl]);

  const handleCopyBranchWorkflowPrompt = useCallback(async () => {
    if (!feature) return;
    const u = requirementUrl.trim();
    if (!u) return;
    await copyToClipboard(
      generateCheetahBranchWorkflowPrompt({
        requirementUrl: u,
        featureDir: feature,
        currentBranch: gitInfo?.branch ?? "",
        cheetahMcpService: deploySettings.cheetahMcpService,
      })
    );
  }, [
    feature,
    requirementUrl,
    gitInfo?.branch,
    deploySettings.cheetahMcpService,
  ]);

  if (!cap) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/20 dark:text-zinc-400">
        点击左侧需求查看详情与 SDD 操作
      </div>
    );
  }

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
                  void openPromptAsync(
                    "推进需求",
                    generateAdvancePrompt(cap, testSummaryLine, {
                      impactScenariosBlock,
                    })
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

        {cap.sdd?.enabled && feature ? (
          <RequirementUrlCard
            requirementUrl={requirementUrl}
            busy={sddSaveBusy}
            onSave={handleSaveRequirementUrl}
            showTapdActions={isTapdRequirementUrl(requirementUrl)}
            onCopyTapdFetchPrompt={() => void handleCopyTapdFetchPrompt()}
            onCopyBranchWorkflowPrompt={() =>
              void handleCopyBranchWorkflowPrompt()
            }
          />
        ) : null}

        {cap.sdd?.enabled ? (
          <SddArtifactsCard
            cap={cap}
            syncBusy={syncBusy}
            syncErr={syncErr}
            showPlan={showPlan}
            showTasks={showTasks}
            showAnalyze={showAnalyze}
            onSync={handleSyncSdd}
            onPlan={() => openPrompt("设计方案", generatePlanPrompt(cap))}
            onTasks={() => openPrompt("拆解任务", generateTasksPrompt(cap))}
            onAnalyze={() =>
              void openPromptAsync("产物分析", generateAnalyzePrompt(cap))
            }
          />
        ) : null}

        <DevTasksCard
          cap={cap}
          showImplement={showImplement}
          onImplement={() =>
            openPrompt("继续开发", generateImplementPrompt(cap))
          }
        />

        {cap.sdd?.enabled && feature ? (
          <ImpactAnalysisCard
            impact={impactAnalysis}
            freshness={impactFreshness}
            loading={requirementPanelLoading}
            onAnalyze={() =>
              openPrompt(
                "影响场景分析",
                generateImpactAnalysisPrompt(cap, changedFilesHint)
              )
            }
            onReanalyze={() =>
              openPrompt(
                "影响场景分析",
                generateImpactAnalysisPrompt(cap, changedFilesHint)
              )
            }
            onViewDetail={() => void openImpactMd()}
          />
        ) : null}

        <UtTestCard
          showTest={showTest}
          testStats={testStats}
          impactScenarioTotal={impactAnalysis?.summary?.total_scenarios ?? 0}
          impactFreshness={impactFreshness}
          onRunTest={() =>
            openPrompt(
              "执行测试",
              generateTestPrompt(cap, testSummaryLine, {
                impactScenariosBlock,
              })
            )
          }
        />

        <CodeSubmitCard
          lastCommitLine={gitInfo?.lastCommitLine ?? null}
          onSubmitCode={() =>
            openPrompt(
              "提交代码",
              generateCodeSubmitPrompt(cap, requirementUrl)
            )
          }
        />

        {cap.sdd?.enabled && feature ? (
          <DeployCard
            branch={gitInfo?.branch ?? ""}
            swimlaneDraft={swimlaneDraft}
            onSwimlaneDraftChange={setSwimlaneDraft}
            onBlurSaveSwimlane={handleSaveSwimlaneBlur}
            saving={sddSaveBusy}
            affectedServicesLine={affectedServicesLine}
            deployServicesDraft={deployServicesDraft}
            onDeployServicesDraftChange={setDeployServicesDraft}
            onBlurSaveDeployServices={handleSaveDeployServicesBlur}
            extensionDefaultServices={deploySettings.defaultServiceList}
            impactFreshness={impactFreshness}
            preflight={preflight}
            onDeployPrompt={() =>
              openPrompt(
                "环境部署",
                generateDeployPrompt({
                  cap,
                  currentBranch: gitInfo?.branch ?? "",
                  swimlane: swimlaneDraft,
                  affectedServices: affectedServicesLine,
                  cicdMcpStatus,
                  cicdMcpInfo,
                  impactFreshness: String(impactFreshness),
                })
              )
            }
          />
        ) : null}

        {cap.sdd?.enabled && feature ? (
          <TestCasesCard
            tests={testCases}
            freshness={testCasesFreshness}
            preflight={preflight}
            onGeneratePrompt={() =>
              openPrompt(
                "测试用例",
                generateTestCasesPrompt({
                  cap,
                  impactScenarios: impactScenariosBlock ?? "（无）",
                  legoMcpStatus,
                  legoMcpInfo,
                })
              )
            }
            onRerunFailedPrompt={() =>
              openPrompt(
                "重跑失败用例",
                `${generateTestCasesPrompt({
                  cap,
                  impactScenarios: impactScenariosBlock ?? "（无）",
                  legoMcpStatus,
                  legoMcpInfo,
                })}\n\n## 仅重跑\n请仅对 status=failed 的用例重新执行 MCP/接口并更新 test-cases.json。`
              )
            }
            onContinuePendingPrompt={() =>
              openPrompt(
                "继续执行用例",
                `${generateTestCasesPrompt({
                  cap,
                  impactScenarios: impactScenariosBlock ?? "（无）",
                  legoMcpStatus,
                  legoMcpInfo,
                })}\n\n## 继续执行\n请仅对 status=pending 的用例执行并更新 JSON。`
              )
            }
            onViewDetail={() => void openTestCasesMd()}
          />
        ) : null}

        <BugTrackingCard
          cap={cap}
          bugDraft={bugDraft}
          onBugDraftChange={setBugDraft}
          onBugfix={() =>
            openPrompt(
              "Bug 修复",
              generateBugfixPrompt(cap, bugDraft.trim() || undefined)
            )
          }
        />

        <ActivityCard activities={activities} />
      </div>

      <PromptDialog
        open={dialogOpen}
        title={dialogTitle}
        prompt={dialogPrompt}
        onClose={() => setDialogOpen(false)}
      />

      <MarkdownReviewDialog
        open={mdOpen}
        title={mdTitle}
        markdownContent={mdContent}
        freshness={mdFreshness}
        onClose={() => setMdOpen(false)}
      />
    </>
  );
}
