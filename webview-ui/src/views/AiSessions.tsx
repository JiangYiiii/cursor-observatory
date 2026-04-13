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
  SessionEvent,
  TimelineItem,
} from "@/components/timeline";
import {
  matchesCapabilityFilter,
  sortSessionsByStartedDesc,
} from "@/lib/timeline-utils";
import { useObservatoryStore } from "@/store/observatory-store";

export function AiSessions() {
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const aiSessions = useObservatoryStore((s) => s.aiSessions);
  const capabilities = useObservatoryStore((s) => s.capabilities);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  const [capFilter, setCapFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(() => {
    const sorted = sortSessionsByStartedDesc(aiSessions);
    if (!capFilter) return sorted;
    return sorted.filter((s) =>
      matchesCapabilityFilter(s.capability_ids, capFilter)
    );
  }, [aiSessions, capFilter]);

  useEffect(() => {
    setPage(1);
  }, [capFilter, pageSize]);

  const pagedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载 AI 会话"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!aiSessions.length) {
    return (
      <EmptyState
        title="暂无 AI 会话日志"
        description="请先执行 Observatory 扫描以生成 ai-sessions.json。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Card title="AI 会话日志" subtitle="按时间倒序；可筛选关联能力">
        <div className="mb-4">
          <CapabilityFilter
            capabilities={capabilities}
            value={capFilter}
            onChange={setCapFilter}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            没有符合当前能力筛选的会话。
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
              {pagedSessions.map((s, i) => (
                <TimelineItem
                  key={s.id}
                  isLast={i === pagedSessions.length - 1}
                >
                  <SessionEvent session={s} />
                </TimelineItem>
              ))}
            </ActivityTimeline>
          </>
        )}
      </Card>
    </div>
  );
}
