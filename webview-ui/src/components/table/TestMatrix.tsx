/**
 * 能力级测试矩阵：筛选、排序、行选中。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §5.2
 */
import { Badge } from "@/components/common";
import {
  filterMatrixRows,
  sortMatrixRows,
  statusLabel,
  type CapabilityQualityRow,
  type MatrixFilter,
  type MatrixSort,
  type QualityStatus,
} from "@/lib/quality-aggregates";

type Props = {
  rows: CapabilityQualityRow[];
  filter: MatrixFilter;
  onFilterChange: (f: MatrixFilter) => void;
  sort: MatrixSort;
  onSortChange: (s: MatrixSort) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

function statusBadgeClass(s: QualityStatus): string {
  switch (s) {
    case "missing":
    case "failed":
      return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200";
    case "insufficient":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "excellent":
      return "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200";
    default:
      return "";
  }
}

export function TestMatrix({
  rows,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectedId,
  onSelect,
}: Props) {
  const display = sortMatrixRows(filterMatrixRows(rows, filter), sort);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          筛选
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as MatrixFilter)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="all">全部</option>
            <option value="missing">缺失</option>
            <option value="failed">失败</option>
            <option value="insufficient">不足</option>
            <option value="good">良好</option>
            <option value="excellent">优秀</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          排序
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as MatrixSort)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="severity">状态严重度</option>
            <option value="tests">用例数</option>
            <option value="name">能力 ID</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
              <th className="px-3 py-2 font-medium">能力</th>
              <th className="px-3 py-2 font-medium">用例</th>
              <th className="px-3 py-2 font-medium">通过</th>
              <th className="px-3 py-2 font-medium">场景</th>
              <th className="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {display.map((r) => {
              const active = selectedId === r.capabilityId;
              const scenarioText =
                r.scenarioExpected > 0
                  ? `${r.scenarioCovered}/${r.scenarioExpected}`
                  : "—";
              const passText =
                r.testTotal > 0
                  ? `${r.testPassed}/${r.testTotal}`
                  : "—";
              return (
                <tr
                  key={r.capabilityId}
                  onClick={() =>
                    onSelect(active ? null : r.capabilityId)
                  }
                  className={`cursor-pointer border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${
                    active
                      ? "bg-violet-50 dark:bg-violet-950/30"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-mono text-[11px] font-medium text-zinc-900 dark:text-zinc-100">
                      {r.capabilityId}
                    </div>
                    {r.title ? (
                      <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                        {r.title}
                      </div>
                    ) : null}
                  </td>
                  <td className="tabular-nums px-3 py-2">{r.testTotal}</td>
                  <td className="tabular-nums px-3 py-2">{passText}</td>
                  <td className="tabular-nums px-3 py-2">{scenarioText}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="neutral"
                      className={`text-[10px] ${statusBadgeClass(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {display.length === 0 ? (
        <p className="text-sm text-zinc-500">没有符合筛选条件的能力。</p>
      ) : null}
    </div>
  );
}
