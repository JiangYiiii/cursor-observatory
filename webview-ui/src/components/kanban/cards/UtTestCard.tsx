import type { DataFreshness } from "@/types/observatory";

type TestStats = {
  total: number;
  passed: number;
  failed: number;
  scenarioExpected: number;
  scenarioCovered: number;
};

type Props = {
  showTest: boolean;
  testStats: TestStats;
  impactScenarioTotal: number;
  impactFreshness: DataFreshness;
  onRunTest: () => void;
};

export function UtTestCard({
  showTest,
  testStats,
  impactScenarioTotal,
  impactFreshness,
  onRunTest,
}: Props) {
  const denom =
    impactScenarioTotal > 0
      ? impactScenarioTotal
      : testStats.scenarioExpected;
  const pct =
    denom > 0
      ? Math.round((testStats.scenarioCovered / denom) * 100)
      : 0;
  const staleWarn = impactFreshness === "stale" || impactFreshness === "missing";

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          UT 测试
        </h3>
        {showTest ? (
          <button
            type="button"
            onClick={onRunTest}
            className="rounded-md bg-orange-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-orange-700"
          >
            执行测试
          </button>
        ) : null}
      </div>
      {staleWarn ? (
        <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          影响分析已过期或缺失：UT Prompt 中的场景对齐可能不准确，请先更新「影响场景分析」。
        </p>
      ) : null}
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        用例：通过 {testStats.passed} / 失败 {testStats.failed} / 总计{" "}
        {testStats.total}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
        场景覆盖（对齐影响分析）：{testStats.scenarioCovered}/
        {denom > 0 ? denom : "—"}
      </p>
      {denom > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width]"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}
