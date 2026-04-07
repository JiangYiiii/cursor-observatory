import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** 可访问名，无 title 时用于区域标签 */
  "aria-label"?: string;
};

export function Card({
  title,
  subtitle,
  children,
  footer,
  className = "",
  "aria-label": ariaLabel,
}: Props) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#2a2a3c] ${className}`}
      aria-label={ariaLabel}
    >
      {(title != null || subtitle != null) && (
        <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
          {title != null && (
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
          )}
          {subtitle != null && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
      {footer != null && (
        <footer className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {footer}
        </footer>
      )}
    </section>
  );
}
