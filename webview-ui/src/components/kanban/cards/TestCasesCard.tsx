import type { DataFreshness, PreflightResult, TestCasesResult } from "@/types/observatory";

type Props = {
  tests: TestCasesResult | null;
  freshness: DataFreshness;
  preflight: PreflightResult | null;
  onGeneratePrompt: () => void;
  onRerunFailedPrompt: () => void;
  onContinuePendingPrompt: () => void;
  onViewDetail: () => void;
};

export function TestCasesCard({
  tests,
  freshness,
  preflight,
  onGeneratePrompt,
  onRerunFailedPrompt,
  onContinuePendingPrompt,
  onViewDetail,
}: Props) {
  const sum = tests?.summary;
  const lego = preflight?.mcpStatus?.testRunner;
  const legoOk = lego?.status === "configured";
  const failed =
    tests?.cases?.filter((c) => c.status === "failed").length ?? 0;
  const pending =
    tests?.cases?.filter((c) => c.status === "pending").length ?? 0;

  const total = sum?.total_scenarios ?? 0;
  const gen = sum?.generated_cases ?? 0;
  const passed = sum?.passed ?? 0;
  const f = sum?.failed ?? 0;
  const pct =
    total > 0 ? Math.round((gen / Math.max(total, 1)) * 100) : 0;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          测试用例
        </h3>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={onGeneratePrompt}
            className="rounded-md bg-fuchsia-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-fuchsia-800"
          >
            生成并执行
          </button>
          {tests && failed > 0 ? (
            <button
              type="button"
              onClick={onRerunFailedPrompt}
              className="rounded-md border border-fuchsia-300 px-2 py-1 text-[10px] text-fuchsia-900 hover:bg-fuchsia-50 dark:border-fuchsia-800 dark:text-fuchsia-100 dark:hover:bg-fuchsia-950/40"
            >
              重跑失败
            </button>
          ) : null}
          {tests && pending > 0 ? (
            <button
              type="button"
              onClick={onContinuePendingPrompt}
              className="rounded-md border border-zinc-300 px-2 py-1 text-[10px] text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              继续执行
            </button>
          ) : null}
          {tests ? (
            <button
              type="button"
              onClick={onViewDetail}
              className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              查看详情
            </button>
          ) : null}
        </div>
      </div>
      <div className="mb-2 rounded bg-zinc-50 px-2 py-1 text-[10px] dark:bg-zinc-800/60">
        <div className="text-zinc-500">测试 MCP（testRunner）</div>
        <div className="font-mono text-zinc-800 dark:text-zinc-100">
          {legoOk
            ? `已配置 · ${lego?.service ?? ""} / ${lego?.tool ?? ""}`
            : `未就绪 · ${lego?.status ?? "unknown"}（仍可生成用例文档）`}
        </div>
      </div>
      <p className="text-[10px] text-zinc-500">
        新鲜度：<span className="font-medium">{freshness}</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">场景</div>
          <div className="font-mono">{total}</div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">已生成</div>
          <div className="font-mono">{gen}</div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">通过/失败</div>
          <div className="font-mono">
            {passed}/{f}
          </div>
        </div>
        <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
          <div className="text-zinc-500">跳过</div>
          <div className="font-mono">{sum?.skipped ?? 0}</div>
        </div>
      </div>
      {total > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-fuchsia-500 transition-[width]"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}
