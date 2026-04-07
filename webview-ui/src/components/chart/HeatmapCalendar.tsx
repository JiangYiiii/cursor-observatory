/**
 * 近 N 天测试运行热度（每日运行次数）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §5.4
 */
import { useMemo } from "react";
import { dailyRunCounts } from "@/lib/quality-aggregates";
import type { TestHistoryEntry } from "@/types/observatory";

type Props = {
  history: TestHistoryEntry[];
  days?: number;
  className?: string;
};

export function HeatmapCalendar({
  history,
  days = 28,
  className = "",
}: Props) {
  const series = useMemo(() => dailyRunCounts(history, days), [history, days]);

  const max = useMemo(
    () => Math.max(1, ...series.map((s) => s.count)),
    [series]
  );

  const cells = useMemo(() => {
    const rows: (typeof series)[] = [];
    for (let i = 0; i < series.length; i += 7) {
      rows.push(series.slice(i, i + 7));
    }
    return rows;
  }, [series]);

  function intensity(c: number): string {
    if (c === 0) return "bg-zinc-100 dark:bg-zinc-800";
    const t = c / max;
    if (t < 0.25) return "bg-emerald-200 dark:bg-emerald-900/60";
    if (t < 0.5) return "bg-emerald-400 dark:bg-emerald-700";
    if (t < 0.75) return "bg-emerald-600 dark:bg-emerald-500";
    return "bg-emerald-800 dark:bg-emerald-400";
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        运行热度（最近 {days} 天，每日测试批次）
      </p>
      <div className="space-y-1">
        {cells.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map((d) => (
              <div
                key={d.date}
                title={`${d.date} · ${d.count} 次`}
                className={`flex h-7 w-7 items-center justify-center rounded text-[9px] font-medium text-zinc-800 dark:text-zinc-100 ${intensity(d.count)}`}
              >
                {d.count > 0 ? d.count : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>少</span>
        <div className="flex gap-0.5">
          <span className="h-3 w-4 rounded-sm bg-zinc-100 dark:bg-zinc-800" />
          <span className="h-3 w-4 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" />
          <span className="h-3 w-4 rounded-sm bg-emerald-500" />
          <span className="h-3 w-4 rounded-sm bg-emerald-800 dark:bg-emerald-400" />
        </div>
        <span>多</span>
      </div>
    </div>
  );
}
