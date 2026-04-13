import type { DataFreshness, ImpactAnalysisResult } from "@/types/observatory";

type Props = {
  impact: ImpactAnalysisResult | null;
  freshness: DataFreshness;
  loading: boolean;
  onAnalyze: () => void;
  onReanalyze: () => void;
  onViewDetail: () => void;
};

export function ImpactAnalysisCard({
  impact,
  freshness,
  loading,
  onAnalyze,
  onReanalyze,
  onViewDetail,
}: Props) {
  const s = impact?.summary;
  const high = s?.high_impact ?? 0;
  const mid = s?.medium_impact ?? 0;
  const low = s?.low_impact ?? 0;
  const apps = s?.affected_applications ?? 0;
  const mods = s?.affected_modules ?? 0;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          影响场景分析
        </h3>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={loading}
            onClick={onAnalyze}
            className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            分析影响
          </button>
          {impact ? (
            <>
              <button
                type="button"
                onClick={onReanalyze}
                className="rounded-md border border-indigo-200 px-2 py-1 text-[10px] font-medium text-indigo-800 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/40"
              >
                重新分析
              </button>
              <button
                type="button"
                onClick={onViewDetail}
                className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                查看详情
              </button>
            </>
          ) : null}
        </div>
      </div>
      {freshness === "missing" && !impact ? (
        <p className="mb-2 text-[10px] text-zinc-500">
          尚未生成影响分析。点击「分析影响」让 AI 产出{" "}
          <code className="rounded bg-zinc-100 px-0.5 dark:bg-zinc-800">
            impact-analysis.json
          </code>
          。
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">高/中/低</div>
          <div className="font-mono text-zinc-900 dark:text-zinc-100">
            {high}/{mid}/{low}
          </div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">场景数</div>
          <div className="font-mono text-zinc-900 dark:text-zinc-100">
            {s?.total_scenarios ?? 0}
          </div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">应用</div>
          <div className="font-mono text-zinc-900 dark:text-zinc-100">{apps}</div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">模块</div>
          <div className="font-mono text-zinc-900 dark:text-zinc-100">{mods}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        状态：
        <span className="ml-1 font-medium text-zinc-700 dark:text-zinc-200">
          {freshness === "missing" ? "未生成" : "已加载"}
        </span>
      </p>
    </section>
  );
}
