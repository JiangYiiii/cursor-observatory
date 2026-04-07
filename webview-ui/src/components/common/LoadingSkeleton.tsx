type Props = {
  variant?: "line" | "card" | "title";
  lines?: number;
  className?: string;
};

export function LoadingSkeleton({
  variant = "line",
  lines = 3,
  className = "",
}: Props) {
  const pulse = "animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700";

  if (variant === "title") {
    return (
      <div className={`space-y-2 ${className}`} aria-busy aria-label="加载中">
        <div className={`h-6 w-1/3 ${pulse}`} />
        <div className={`h-4 w-full ${pulse}`} />
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className={`rounded-lg border border-zinc-200 p-4 dark:border-zinc-700 ${className}`}
        aria-busy
        aria-label="加载中"
      >
        <div className={`mb-3 h-5 w-1/4 ${pulse}`} />
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className={`h-3 w-full ${pulse}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`} aria-busy aria-label="加载中">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 w-full ${pulse}`}
          style={{ width: `${85 + (i % 3) * 5}%` }}
        />
      ))}
    </div>
  );
}
