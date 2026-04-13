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
  /** 是否已有 impact-analysis 数据 */
  hasImpactAnalysis: boolean;
  /** 是否已有 test-cases.json */
  hasTestCasesFile: boolean;
  onRunTest: () => void;
};

export function UtTestCard({
  showTest,
  testStats,
  impactScenarioTotal,
  hasImpactAnalysis,
  hasTestCasesFile,
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

  const showMissingImpact = !hasImpactAnalysis;
  const showMissingTestCases = hasImpactAnalysis && !hasTestCasesFile;

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
      {showMissingImpact ? (
        <p className="mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          请先在上方完成「影响场景分析」，以便 UT Prompt 与场景对齐。
        </p>
      ) : null}
      {showMissingTestCases ? (
        <p className="mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
          尚未生成测试用例文件（<span className="font-mono">test-cases.json</span>
          ）。可在下方「测试用例」卡片生成后再对齐执行。
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
