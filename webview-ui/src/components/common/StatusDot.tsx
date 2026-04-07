import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, Circle } from "lucide-react";

const toneClass: Record<
  "success" | "warning" | "error" | "neutral",
  string
> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
  neutral: "text-zinc-400 dark:text-zinc-500",
};

const toneIcon: Record<
  "success" | "warning" | "error" | "neutral",
  LucideIcon
> = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
  neutral: Circle,
};

type Props = {
  /** 色盲友好：必须展示文字说明 */
  label: string;
  tone: keyof typeof toneClass;
  className?: string;
};

export function StatusDot({ label, tone, className = "" }: Props) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-200 ${className}`}
    >
      <Icon
        className={`size-4 shrink-0 ${toneClass[tone]}`}
        aria-hidden
        strokeWidth={2}
      />
      <span>{label}</span>
    </span>
  );
}
