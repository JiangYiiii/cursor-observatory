import {
  Card,
  EmptyState,
  ErrorState,
  FreshnessBadge,
  LoadingSkeleton,
} from "@/components/common";
import { DocsCheckTable } from "@/components/table";
import { useObservatoryStore } from "@/store/observatory-store";

export function DocsHealth() {
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const docsHealth = useObservatoryStore((s) => s.docsHealth);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载文档健康度"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!docsHealth) {
    return (
      <EmptyState
        title="暂无 docs-health 数据"
        description="请先执行 Observatory 扫描以生成 docs-health.json。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  const score = docsHealth.overall_score;
  const checks = docsHealth.checks ?? [];

  return (
    <div className="space-y-4">
      <Card
        title="文档健康度"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <FreshnessBadge
              generatedAt={docsHealth.generated_at}
              labelPrefix="生成"
            />
          </span>
        }
      >
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">综合得分</p>
            <p
              className={`text-4xl font-semibold tabular-nums ${
                score == null
                  ? "text-zinc-400"
                  : score >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : score >= 50
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
              }`}
            >
              {score != null ? score : "—"}
            </p>
          </div>
          <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
            得分来自多项检查加权；点击下表行可展开 <code className="text-xs">details</code>{" "}
            查看缺失模块、失效路径等明细。
          </p>
        </div>

        <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          检查项明细
        </h3>
        <DocsCheckTable checks={checks} />
      </Card>
    </div>
  );
}
