import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  FreshnessBadge,
  LoadingSkeleton,
  PaginationControls,
} from "@/components/common";
import { SessionDetail, SessionList } from "@/components/session";
import {
  collectAllTags,
  filterSessionEntries,
  type SessionTimeRange,
} from "@/lib/session-filters";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import type { SessionDetail as SessionDetailData } from "@/types/observatory";
import type { SessionIndexEntry } from "@/types/observatory";

export function SessionManager() {
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const sessionIndex = useObservatoryStore((s) => s.sessionIndex);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  const [status, setStatus] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<SessionTimeRange>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [detail, setDetail] = useState<SessionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const rawEntries: SessionIndexEntry[] = sessionIndex?.sessions ?? [];

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of rawEntries) {
      if (e.status) set.add(String(e.status));
    }
    return ["all", ...[...set].sort()];
  }, [rawEntries]);

  const tagOptions = useMemo(
    () => ["all", ...collectAllTags(rawEntries)],
    [rawEntries]
  );

  const filtered = useMemo(
    () =>
      filterSessionEntries(rawEntries, {
        status,
        tag,
        timeRange,
        query,
      }),
    [rawEntries, status, tag, timeRange, query]
  );

  useEffect(() => {
    setPage(1);
  }, [status, tag, timeRange, query, pageSize]);

  const pagedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (
      selectedId &&
      !filtered.some((e) => e.id === selectedId)
    ) {
      setSelectedId(null);
      setDetail(null);
      setDetailError(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void getDataSource()
      .getSession(selectedId)
      .then((d) => {
        if (cancelled) return;
        if (!d) {
          setDetail(null);
          setDetailError("未找到会话详情");
        } else {
          setDetail(d);
        }
        setDetailLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(e instanceof Error ? e.message : String(e));
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载会话索引"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!sessionIndex || rawEntries.length === 0) {
    return (
      <EmptyState
        title="暂无会话"
        description="请确认 Extension 已生成 sessions/index.json。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <Card
          title="会话列表"
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <FreshnessBadge
                generatedAt={sessionIndex.generated_at as string | undefined}
                labelPrefix="索引"
              />
              <span className="text-zinc-400">
                共 {rawEntries.length} 条
                {filtered.length !== rawEntries.length
                  ? ` · 筛选后 ${filtered.length} 条`
                  : ""}
              </span>
            </span>
          }
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              状态
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "全部" : s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              标签
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {tagOptions.map((t) => (
                  <option key={t} value={t}>
                    {t === "all" ? "全部" : t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              时间
              <select
                value={timeRange}
                onChange={(e) =>
                  setTimeRange(e.target.value as SessionTimeRange)
                }
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="all">全部</option>
                <option value="7d">近 7 天</option>
                <option value="30d">近 30 天</option>
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-1">
                <Search className="size-3.5" aria-hidden />
                搜索（标题 / ID / 项目 / 标签）
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入关键词过滤…"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>

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

          <SessionList
            entries={pagedEntries}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Card>
      </div>

      <SessionDetail
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
          setDetailError(null);
        }}
      />
    </div>
  );
}
