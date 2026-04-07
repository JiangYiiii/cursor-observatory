const PAGE_SIZES = [10, 20, 50, 100, 200] as const;

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className = "",
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400 ${className}`}
    >
      <span className="tabular-nums">
        {total === 0
          ? "无数据"
          : `第 ${start}–${end} 条，共 ${total} 条 · 第 ${safePage}/${totalPages} 页`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          每页
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-1.5 py-1 tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          条
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
