import { Clock } from "lucide-react";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "未知时间";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

type Props = {
  /** ISO 8601 或 Date */
  generatedAt?: string | Date | null;
  labelPrefix?: string;
  className?: string;
};

/**
 * 数据新鲜度：图标 + 文字，不单独依赖颜色。
 */
export function FreshnessBadge({
  generatedAt,
  labelPrefix = "数据",
  className = "",
}: Props) {
  if (generatedAt == null) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}
      >
        <Clock className="size-3.5" aria-hidden />
        <span>{labelPrefix}：无时间戳</span>
      </span>
    );
  }

  const iso =
    typeof generatedAt === "string" ? generatedAt : generatedAt.toISOString();
  const rel = formatRelative(iso);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300 ${className}`}
      title={iso}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span>
        {labelPrefix}：{rel}
      </span>
    </span>
  );
}
