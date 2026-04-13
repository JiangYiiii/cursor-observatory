import { useState, useCallback, useEffect, useMemo } from "react";
import { isAtBlueGreenTrafficStage } from "@/lib/release-traffic-stage";
import { useReleaseStore } from "@/store/release-store";
import type { BatchOperationItemResult } from "@/types/observatory";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  RotateCcw,
  Ban,
  Loader2,
  X,
} from "lucide-react";

const GREEN_PRESETS = [0, 25, 50, 75, 100] as const;

function clampGreenPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface BatchTrafficDialogProps {
  open: boolean;
  onClose: () => void;
  pipelines: string[];
  /** 选中但非 canary 的流水线数量（批量切流会忽略） */
  skippedNonCanaryCount?: number;
  /** 批量切流目标：绿版本流量比例 0–100 */
  targetGreenPercent: number;
  onTargetGreenPercentChange: (value: number) => void;
}

type Phase = "confirm" | "executing" | "result";

const STATUS_ICON: Record<string, React.ReactNode> = {
  applied: <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />,
  skipped: <RotateCcw className="h-4 w-4 text-zinc-400" />,
  conflicted: <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />,
  failed: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
  cancelled: <Ban className="h-4 w-4 text-zinc-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  applied: "已切流",
  skipped: "已跳过",
  conflicted: "冲突",
  failed: "失败",
  cancelled: "已取消",
};

export function BatchTrafficDialog({
  open,
  onClose,
  pipelines: targetPipelines,
  skippedNonCanaryCount = 0,
  targetGreenPercent,
  onTargetGreenPercentChange,
}: BatchTrafficDialogProps) {
  const pipelinesInfo = useReleaseStore((s) => s.pipelines);
  const stageSummaries = useReleaseStore((s) => s.stageSummaries);
  const canaryStates = useReleaseStore((s) => s.canaryStates);
  const trafficPrecheckByPipeline = useReleaseStore((s) => s.trafficPrecheckByPipeline);
  const trafficPrecheckLoading = useReleaseStore((s) => s.trafficPrecheckLoading);
  const batchShiftTraffic = useReleaseStore((s) => s.batchShiftTraffic);
  const cancelBatchOperation = useReleaseStore((s) => s.cancelBatchOperation);
  const batchProgress = useReleaseStore((s) => s.batchProgress);
  const shifting = useReleaseStore((s) => s.loading.shifting);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [results, setResults] = useState<BatchOperationItemResult[]>([]);

  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setResults([]);
    }
  }, [open]);

  const targetBluePercent = 100 - targetGreenPercent;

  const handleExecute = useCallback(async () => {
    const green = clampGreenPercent(targetGreenPercent);
    onTargetGreenPercentChange(green);
    setPhase("executing");
    const { results: res } = await batchShiftTraffic(green);
    setResults(res);
    setPhase("result");
  }, [batchShiftTraffic, targetGreenPercent, onTargetGreenPercentChange]);

  const setGreenFromInput = useCallback(
    (raw: string) => {
      const n = Number.parseInt(raw, 10);
      onTargetGreenPercentChange(clampGreenPercent(n));
    },
    [onTargetGreenPercentChange],
  );

  const { allowCount, blockCount, missingCanaryCount } = useMemo(() => {
    let allow = 0;
    let block = 0;
    let missing = 0;
    for (const name of targetPipelines) {
      if (!canaryStates[name]) {
        missing++;
        continue;
      }
      const pre = trafficPrecheckByPipeline[name];
      if (pre && !pre.canSwitch) block++;
      else allow++;
    }
    return { allowCount: allow, blockCount: block, missingCanaryCount: missing };
  }, [targetPipelines, canaryStates, trafficPrecheckByPipeline]);

  /** 支持蓝绿但阶段推断未到「待蓝绿切流」：切流可能无效或需先在流水线侧推进 */
  const notAtBlueGreenSwitchStage = useMemo(() => {
    const rows: { name: string; stageLabel: string }[] = [];
    for (const name of targetPipelines) {
      const p = pipelinesInfo.find((x) => x.name === name);
      if (!p?.hasCanary) continue;
      const st = stageSummaries[name];
      if (!st) continue;
      if (isAtBlueGreenTrafficStage(st, p.ksPipelineType)) continue;
      rows.push({ name, stageLabel: st.stageLabel });
    }
    return rows;
  }, [targetPipelines, pipelinesInfo, stageSummaries]);

  const canConfirm =
    targetPipelines.length > 0
    && !trafficPrecheckLoading
    && missingCanaryCount === 0
    && allowCount > 0;

  if (!open) return null;

  const failedCount = results.filter((r) => r.status === "failed").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-0 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">确认切流</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-80 overflow-y-auto px-4 py-3">
          {phase === "confirm" && (
            <div className="space-y-3">
              {trafficPrecheckLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在预检切流条件…
                </div>
              )}

              {skippedNonCanaryCount > 0 && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  已选 {skippedNonCanaryCount} 条非蓝绿流水线，不会参与批量切流。
                </p>
              )}

              {notAtBlueGreenSwitchStage.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-[10px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-medium">阶段提示（未到「待蓝绿切流」）</p>
                  <p className="mt-1 text-amber-800/95 dark:text-amber-300/95">
                    下列流水线在 KubeSphere 上为蓝绿类型，但当前阶段尚未处于「待蓝绿切流」。此时在面板切流可能无效，或需先在流水线完成部署/内测/灰度前置步骤后再切流。
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                    {notAtBlueGreenSwitchStage.map((r) => (
                      <li key={r.name}>
                        <span className="font-mono">{r.name}</span>
                        <span className="text-amber-700/90 dark:text-amber-400/90">
                          {" "}
                          — 当前：{r.stageLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900/40">
                <p className="mb-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                  目标绿流量比例（蓝为 {targetBluePercent}%）
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Number.isFinite(targetGreenPercent) ? targetGreenPercent : 0}
                    onChange={(e) => setGreenFromInput(e.target.value)}
                    className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    aria-label="目标绿流量百分比"
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">% 绿</span>
                  <div className="flex flex-wrap gap-1">
                    {GREEN_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => onTargetGreenPercentChange(p)}
                        className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                          targetGreenPercent === p
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300"
                            : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <ul className="space-y-2">
                {targetPipelines.map((name) => {
                  const canary = canaryStates[name];
                  const pre = trafficPrecheckByPipeline[name];
                  if (!canary) {
                    return (
                      <li key={name} className="text-xs text-amber-700 dark:text-amber-400">
                        <span className="font-medium">{name}</span>
                        <span className="ml-2">（未加载到蓝绿快照，请关闭后重试「批量切流」或先刷新状态）</span>
                      </li>
                    );
                  }
                  const blocked = pre && !pre.canSwitch;
                  return (
                    <li key={name} className="text-xs">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{name}</span>
                        {pre && (
                          <span
                            className={
                              blocked
                                ? "text-red-600 dark:text-red-400"
                                : "text-green-600 dark:text-green-400"
                            }
                          >
                            {blocked ? "预检：不可切流" : "预检：可切流"}
                          </span>
                        )}
                      </div>
                      {blocked && pre.reason && (
                        <p className="mt-0.5 pl-0 text-[10px] text-red-600/90 dark:text-red-400/90">
                          {pre.reason}
                        </p>
                      )}
                      <div className="mt-0.5 flex gap-4 pl-0 text-[10px]">
                        <span className="text-blue-600 dark:text-blue-400">
                          蓝: {canary.blueWeight}% → {targetBluePercent}%
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          绿: {canary.greenWeight}% → {targetGreenPercent}%
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {targetPipelines.length === 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">没有可切的蓝绿流水线。</p>
              )}

              {!trafficPrecheckLoading && targetPipelines.length > 0 && blockCount > 0 && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  预检未通过的流水线将在执行时跳过，不会发起切流。
                </p>
              )}

              <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-0.5">
                  <p>此操作将影响线上流量</p>
                  {targetGreenPercent === 100 && (
                    <p className="font-medium">此操作将完全切到新版本</p>
                  )}
                  {targetGreenPercent === 0 && (
                    <p className="font-medium">此操作将回退新版本流量至零</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === "executing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {batchProgress
                  ? `已完成 ${batchProgress.completed}/${batchProgress.total}`
                  : "正在执行切流…"}
              </div>
              {batchProgress && (
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {phase === "result" && (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {results.map((r) => (
                  <li key={r.pipeline} className="flex items-start gap-2 text-xs">
                    {STATUS_ICON[r.status] ?? STATUS_ICON.failed}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.pipeline}</span>
                      <span className="ml-2 text-zinc-500 dark:text-zinc-400">{STATUS_LABEL[r.status]}</span>
                      {r.message && (
                        <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{r.message}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {failedCount > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  已切流量不会自动回滚，仅重试未生效项
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          {phase === "confirm" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={!canConfirm || shifting}
                title={
                  !canConfirm
                    ? "请等待预检完成且至少有一条可切流流水线，并已加载蓝绿快照"
                    : undefined
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                确认切流
              </button>
            </>
          )}
          {phase === "executing" && (
            <button
              type="button"
              onClick={cancelBatchOperation}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-zinc-700"
            >
              取消
            </button>
          )}
          {phase === "result" && (
            <button
              type="button"
              onClick={onClose}
              disabled={shifting}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              关闭
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
