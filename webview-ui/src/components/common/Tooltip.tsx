import type { ReactNode } from "react";
import { useId, useState } from "react";

type Props = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * 简易悬停/聚焦提示（无 Radix）。依赖 CSS group-hover。
 */
export function Tooltip({ content, children, className = "" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className="group inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span
          aria-describedby={open ? id : undefined}
          tabIndex={0}
          className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-sm"
        >
          {children}
        </span>
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-zinc-200 bg-zinc-900 px-2 py-1 text-xs text-white shadow-md dark:border-zinc-600 dark:bg-zinc-800"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
