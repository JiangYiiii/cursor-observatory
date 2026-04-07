import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: { label: string; onClick: () => void };
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-12 text-center dark:border-zinc-600 dark:bg-zinc-900/30 ${className}`}
      role="status"
    >
      <Icon
        className="size-10 text-zinc-400 dark:text-zinc-500"
        aria-hidden
        strokeWidth={1.25}
      />
      <div>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {title}
        </p>
        {description != null && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {action != null && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
