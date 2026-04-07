import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  /** 可点击跳转；不传则渲染为静态卡片 */
  to?: string;
  className?: string;
};

export function OverviewStatCard({
  title,
  value,
  hint,
  to,
  className = "",
}: Props) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {hint != null ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </>
  );

  const boxClass = `rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-700 dark:bg-[#2a2a3c] ${className} ${
    to
      ? "block cursor-pointer hover:border-blue-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-500"
      : ""
  }`;

  if (to) {
    return (
      <Link to={to} className={boxClass}>
        {inner}
      </Link>
    );
  }

  return <div className={boxClass}>{inner}</div>;
}
