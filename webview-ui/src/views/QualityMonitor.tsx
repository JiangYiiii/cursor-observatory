import { FlaskConical, Play } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  FreshnessBadge,
  LoadingSkeleton,
} from "@/components/common";
import {
  CoverageGauge,
  HeatmapCalendar,
  TestTrend,
} from "@/components/chart";
import { ExpectationScenarioEditor } from "@/components/quality/ExpectationScenarioEditor";
import { DataTable, TestMatrix } from "@/components/table";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import { useThemeStore } from "@/store/theme-store";
import type { TestCaseRow } from "@/types/observatory";
import {
  buildCapabilityQualityRows,
  computeOverviewMetrics,
  historySeriesForCapability,
  type MatrixFilter,
  type MatrixSort,
} from "@/lib/quality-aggregates";

function pct(r: number): string {
  if (Number.isNaN(r)) return "—";
  return `${Math.round(r * 1000) / 10}%`;
}

export function QualityMonitor() {
  const dark = useThemeStore((s) => s.theme === "dark");
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const capabilities = useObservatoryStore((s) => s.capabilities);
  const testResults = useObservatoryStore((s) => s.testResults);
  const testExpectations = useObservatoryStore((s) => s.testExpectations);
  const testHistory = useObservatoryStore((s) => s.testHistory);
  const loadAll = useObservatoryStore((s) => s.loadAll);
  const refresh = useObservatoryStore((s) => s.refresh);

  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>("all");
  const [matrixSort, setMatrixSort] = useState<MatrixSort>("severity");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const matrixRows = useMemo(
    () => buildCapabilityQualityRows(capabilities, testResults, testExpectations),
    [capabilities, testResults, testExpectations]
  );

  const overview = useMemo(
    () =>
      computeOverviewMetrics(
        capabilities,
        testResults,
        testExpectations,
        testHistory
      ),
    [capabilities, testResults, testExpectations, testHistory]
  );

  const trendSeries = useMemo(
    () => historySeriesForCapability(testHistory, selectedId),
    [testHistory, selectedId]
  );

  const caseRows = useMemo(() => {
    if (!selectedId || !testResults?.test_cases) return [];
    return testResults.test_cases.filter(
      (c) => (c as TestCaseRow).capability_id === selectedId
    ) as TestCaseRow[];
  }, [testResults, selectedId]);

  async function onRunTests(capId?: string) {
    try {
      await getDataSource().triggerTests(capId);
      await refresh("tests");
    } catch {
      /* HTTP 占位实现可能仅 console */
    }
  }

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={8} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载质量数据"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!testResults) {
    return (
      <EmptyState
        title="暂无测试结果"
        description="请先运行测试并生成 test-results.json，或执行 Observatory 同步。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  const capCov = overview.capabilityCoverage;
  const pass = overview.passRate;
  const scen = overview.scenarioCoverage;
  const summaryFailed = Number(
    (testResults.summary as { failed?: number }).failed ?? 0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            质量监控
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <FreshnessBadge
              generatedAt={testResults.last_run}
              labelPrefix="最近运行"
            />
            <span className="text-xs text-zinc-500">
              runner: {testResults.runner}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onRunTests()}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            <Play className="size-4" aria-hidden />
            运行全部测试
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">能力覆盖率</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {pct(capCov.ratio)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {capCov.covered}/{capCov.total} 有能力测试
          </p>
          {capCov.ratio < 0.5 ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              偏低
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              正常
            </p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">测试通过率</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {pass.total === 0 ? "—" : pct(pass.ratio)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {pass.passed}/{pass.total} 通过
          </p>
          {pass.total > 0 && pass.ratio >= 1 ? (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              优秀
            </p>
          ) : pass.total > 0 && summaryFailed > 0 ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">存在失败</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">—</p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">场景覆盖率</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {scen.expected === 0 ? "—" : pct(scen.ratio)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {scen.covered}/{scen.expected} 场景（期望）
          </p>
          {scen.expected > 0 && scen.ratio < 0.5 ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              偏低
            </p>
          ) : scen.expected > 0 ? (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              可接受
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">无期望数据</p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">用例总数</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {overview.totalCases}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {overview.weekDeltaCases != null
              ? `较约 7 天前：${
                  overview.weekDeltaCases >= 0 ? "+" : ""
                }${overview.weekDeltaCases} 用例`
              : "历史对比：数据不足"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="运行热度" subtitle="来自 test-history 按日聚合">
          <HeatmapCalendar history={testHistory} days={28} />
        </Card>
        <Card title="场景覆盖" subtitle="期望场景（test-expectations）">
          {scen.expected === 0 ? (
            <p className="text-sm text-zinc-500">
              暂无期望场景数据，无法计算覆盖率。
            </p>
          ) : (
            <CoverageGauge
              ratio={scen.ratio}
              label="场景覆盖"
              dark={dark}
            />
          )}
        </Card>
      </div>

      <Card title="测试趋势" subtitle="历史运行汇总（JSONL）">
        <TestTrend
          series={trendSeries}
          dark={dark}
          subtitle={
            selectedId
              ? `能力 ${selectedId}（若历史含 by_capability 则按能力；否则为全局）`
              : "全局（未选中能力）"
          }
        />
      </Card>

      <Card title="能力测试矩阵" subtitle="点击行查看场景与用例明细">
        <TestMatrix
          rows={matrixRows}
          filter={matrixFilter}
          onFilterChange={setMatrixFilter}
          sort={matrixSort}
          onSortChange={setMatrixSort}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </Card>

      {selectedId ? (
        <Card
          title={`能力详情 · ${selectedId}`}
          subtitle="期望场景与最近一次结果的用例"
        >
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                <FlaskConical className="size-4" aria-hidden />
                期望场景（手动编辑）
              </h3>
              <ExpectationScenarioEditor
                capabilityId={selectedId}
                testExpectations={testExpectations}
                testResults={testResults}
                onSaved={async () => {
                  await refresh("tests");
                }}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                用例明细
              </h3>
              <DataTable<TestCaseRow & Record<string, unknown>>
                columns={[
                  {
                    key: "name",
                    header: "用例",
                    render: (row) => (
                      <span className="font-mono text-[11px]">
                        {row.name ?? row.id ?? "—"}
                      </span>
                    ),
                  },
                  { key: "status", header: "结果" },
                  {
                    key: "duration_ms",
                    header: "耗时",
                    render: (row) =>
                      row.duration_ms != null ? `${row.duration_ms} ms` : "—",
                  },
                ]}
                rows={caseRows as (TestCaseRow & Record<string, unknown>)[]}
                emptyLabel="该能力下无用例记录（检查 capability_id 标记）"
              />
            </div>
            <button
              type="button"
              onClick={() => void onRunTests(selectedId)}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              <Play className="size-4" aria-hidden />
              仅运行此能力测试
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
