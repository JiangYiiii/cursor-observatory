import type { ReactNode } from "react";

const variants = {
  default:
    "border border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
  success:
    "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  warning:
    "border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  danger:
    "border border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
  neutral:
    "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
} as const;

export type BadgeVariant = keyof typeof variants;

type Props = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
};

export function Badge({
  children,
  variant = "default",
  className = "",
  title,
}: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}
