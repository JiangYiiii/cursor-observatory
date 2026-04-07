/**
 * 通用表格（用例明细等）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §5.3
 */
import type { ReactNode } from "react";

export type DataColumn<T> = {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
};

type Props<T extends Record<string, unknown>> = {
  columns: DataColumn<T>[];
  rows: T[];
  emptyLabel?: string;
  /** 行点击 */
  onRowClick?: (row: T) => void;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyLabel = "无数据",
  onRowClick,
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyLabel}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200 ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${
                onRowClick
                  ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  : ""
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-zinc-800 dark:text-zinc-200 ${col.className ?? ""}`}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
