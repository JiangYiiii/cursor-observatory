import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title,
  message,
  onRetry,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50/80 px-6 py-8 text-center dark:border-red-900/60 dark:bg-red-950/30 ${className}`}
      role="alert"
    >
      <AlertTriangle
        className="size-8 text-red-600 dark:text-red-400"
        aria-hidden
      />
      <div>
        <p className="text-sm font-semibold text-red-900 dark:text-red-100">
          {title}
        </p>
        {message != null && (
          <p className="mt-1 text-xs text-red-800/90 dark:text-red-200/90">
            {message}
          </p>
        )}
      </div>
      {onRetry != null && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900/50"
        >
          重试
        </button>
      )}
    </div>
  );
}
