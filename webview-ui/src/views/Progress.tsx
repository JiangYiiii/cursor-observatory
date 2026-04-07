import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PaginationControls,
} from "@/components/common";
import {
  ActivityTimeline,
  CapabilityFilter,
  CommitEvent,
  TimelineItem,
} from "@/components/timeline";
import {
  matchesCapabilityFilter,
  sortTimelineByTimestampDesc,
} from "@/lib/timeline-utils";
import { useObservatoryStore } from "@/store/observatory-store";

export function Progress() {
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const progress = useObservatoryStore((s) => s.progress);
  const capabilities = useObservatoryStore((s) => s.capabilities);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  const [capFilter, setCapFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const rawTimeline = progress?.timeline ?? [];
  const filtered = useMemo(() => {
    const sorted = sortTimelineByTimestampDesc(rawTimeline);
    if (!capFilter) return sorted;
    return sorted.filter((e) =>
      matchesCapabilityFilter(e.capability_ids, capFilter)
    );
  }, [rawTimeline, capFilter]);

  useEffect(() => {
    setPage(1);
  }, [capFilter, pageSize]);

  const pagedTimeline = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const summary = progress?.summary as
    | {
        total_commits?: number;
        active_branch?: string;
        recent_days?: number;
      }
    | undefined;

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载开发进度"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!progress || rawTimeline.length === 0) {
    return (
      <EmptyState
        title="暂无进度时间线"
        description="请先执行 Observatory 扫描以生成 progress.json（含 Git 提交与能力关联）。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {summary.total_commits != null ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-[#2a2a3c]">
              <p className="text-xs text-zinc-500">总提交</p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {summary.total_commits}
              </p>
            </div>
          ) : null}
          {summary.active_branch ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-[#2a2a3c]">
              <p className="text-xs text-zinc-500">当前分支</p>
              <p className="truncate font-mono text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {summary.active_branch}
              </p>
            </div>
          ) : null}
          {summary.recent_days != null ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-[#2a2a3c]">
              <p className="text-xs text-zinc-500">统计窗口（天）</p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {summary.recent_days}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <Card
        title="提交时间线"
        subtitle={
          progress.generated_at
            ? `数据生成于 ${progress.generated_at}`
            : "来自 progress.json"
        }
      >
        <div className="mb-4">
          <CapabilityFilter
            capabilities={capabilities}
            value={capFilter}
            onChange={setCapFilter}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            没有符合当前能力筛选的提交事件。
          </p>
        ) : (
          <>
            <PaginationControls
              className="mb-3"
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            <ActivityTimeline>
              {pagedTimeline.map((e, i) => (
                <TimelineItem
                  key={e.id}
                  isLast={i === pagedTimeline.length - 1}
                >
                  <CommitEvent event={e} />
                </TimelineItem>
              ))}
            </ActivityTimeline>
          </>
        )}
      </Card>
    </div>
  );
}
