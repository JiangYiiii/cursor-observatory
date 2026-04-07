/**
 * SDD 产物区块（同步、设计方案、拆解任务、产物分析）。
 */
import { RefreshCw } from "lucide-react";
import type { Capability } from "@/types/observatory";

type Props = {
  cap: Capability;
  syncBusy: boolean;
  syncErr: string | null;
  showPlan: boolean;
  showTasks: boolean;
  showAnalyze: boolean;
  onSync: () => void;
  onPlan: () => void;
  onTasks: () => void;
  onAnalyze: () => void;
};

export function SddArtifactsCard({
  cap,
  syncBusy,
  syncErr,
  showPlan,
  showTasks,
  showAnalyze,
  onSync,
  onPlan,
  onTasks,
  onAnalyze,
}: Props) {
  const d = cap.sdd?.documents;
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
    <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-600 dark:bg-zinc-900/30">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          SDD 产物
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          {cap.sdd?.workspacePath?.startsWith("specs/") ? (
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void onSync()}
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
              onClick={onPlan}
              className="rounded bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
            >
              设计方案
            </button>
          ) : null}
          {showTasks ? (
            <button
              type="button"
              onClick={onTasks}
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
        {cap.sdd?.workspacePath}
      </p>
      {cap.sdd?.specAuthor ? (
        <p className="mb-2 text-[10px] text-zinc-600 dark:text-zinc-400">
          Spec 创建者：{" "}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {cap.sdd.specAuthor}
          </span>
        </p>
      ) : null}
      {docRow}
      {cap.sdd?.phaseDeclaredInObservatorySdd ? (
        <p className="mt-2 text-[10px] text-sky-800 dark:text-sky-200">
          阶段由 observatory-sdd.json 的 declaredPhase 声明（全量扫描保留）
        </p>
      ) : null}
      {cap.sdd?.skipTestingAfterTasks ? (
        <p className="mt-2 text-[10px] text-emerald-800 dark:text-emerald-200">
          已声明：任务完成后跳过单独测试阶段
        </p>
      ) : null}
      {showAnalyze ? (
        <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-600">
          <button
            type="button"
            onClick={onAnalyze}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          >
            产物分析
          </button>
        </div>
      ) : null}
    </section>
  );
}
