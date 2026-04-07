import { AlertTriangle, Info } from "lucide-react";
import { lazy, Suspense } from "react";
import { OverviewStatCard } from "@/components/overview/OverviewStatCard";
import { RecentAiSessionList } from "@/components/timeline/RecentAiSessionList";
import {
  Card,
  ErrorState,
  FreshnessBadge,
  LoadingSkeleton,
} from "@/components/common";

const PhaseDistribution = lazy(() =>
  import("@/components/chart/PhaseDistribution").then((m) => ({
    default: m.PhaseDistribution,
  }))
);
import {
  buildAttentionItems,
  countSessionsInRange,
  formatRelativeZh,
  summarizePhaseProgress,
} from "@/lib/overview-aggregates";
import { useObservatoryStore } from "@/store/observatory-store";
import { useThemeStore } from "@/store/theme-store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function Overview() {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === "dark";

  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const manifest = useObservatoryStore((s) => s.manifest);
  const capabilities = useObservatoryStore((s) => s.capabilities);
  const aiSessions = useObservatoryStore((s) => s.aiSessions);
  const testResults = useObservatoryStore((s) => s.testResults);
  const docsHealth = useObservatoryStore((s) => s.docsHealth);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={5} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载 Observatory 数据"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  const proj = manifest?.project as { name?: string } | undefined;
  const observatory = manifest?.observatory as
    | { last_full_scan?: string }
    | undefined;

  const phaseHint = summarizePhaseProgress(capabilities);
  const weekNew = countSessionsInRange(aiSessions, WEEK_MS);

  const summary = testResults?.summary as
    | { total?: number; passed?: number; failed?: number }
    | undefined;
  const testLine =
    summary && typeof summary.total === "number"
      ? `${summary.passed ?? 0}/${summary.total} 通过`
      : "暂无测试汇总";

  const score = docsHealth?.overall_score;
  const qualityHint =
    score != null
      ? `文档健康 ${score} 分 · ${testLine}`
      : `文档健康 — · ${testLine}`;

  const attention = buildAttentionItems({ capabilities, docsHealth });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {proj?.name ?? "未命名项目"}
        </h2>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <FreshnessBadge
            generatedAt={observatory?.last_full_scan}
            labelPrefix="最近全量扫描"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewStatCard
          title="AI 做了什么"
          value={aiSessions.length}
          hint={`最近 7 天新增 ${weekNew} 条会话`}
          to="/ai-sessions"
        />
        <OverviewStatCard
          title="做到哪一步"
          value={capabilities.length}
          hint={`${phaseHint.done} 已发布 · ${phaseHint.inProgress} 推进中${
            phaseHint.atRisk > 0 ? ` · ${phaseHint.atRisk} 测试风险` : ""
          }`}
          to="/capabilities"
        />
        <OverviewStatCard
          title="结果是否可用"
          value={score != null ? `${score}` : "—"}
          hint={qualityHint}
          to="/quality"
        />
        <OverviewStatCard
          title="数据新鲜度"
          value={formatRelativeZh(observatory?.last_full_scan)}
          hint="扫描与文档新鲜度 · 点此查看文档健康"
          to="/docs-health"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="需求进度分布"
          subtitle="按 phase 聚合"
          aria-label="需求阶段分布图"
        >
          <Suspense
            fallback={<LoadingSkeleton variant="card" lines={4} />}
          >
            <PhaseDistribution
              capabilities={capabilities}
              dark={dark}
            />
          </Suspense>
        </Card>
        <Card title="最近 AI 活动" subtitle="按开始时间倒序">
          <RecentAiSessionList sessions={aiSessions} max={8} />
        </Card>
      </div>

      <Card title="待关注项" subtitle="来自能力与文档健康检查">
        {attention.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            当前无待关注项。保持扫描与测试任务更新可获得更准确的提醒。
          </p>
        ) : (
          <ul className="space-y-2">
            {attention.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"
              >
                {item.severity === "warning" ? (
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden
                  />
                ) : (
                  <Info
                    className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400"
                    aria-hidden
                  />
                )}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
