import type { Capability } from "@/types/observatory";

type Props = {
  cap: Capability;
  showImplement: boolean;
  onImplement: () => void;
};

export function DevTasksCard({ cap, showImplement, onImplement }: Props) {
  const ts = cap.sdd?.taskStats;
  if (!ts || ts.total <= 0) return null;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          开发任务
        </h3>
        {showImplement ? (
          <button
            type="button"
            onClick={onImplement}
            className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-700"
          >
            继续开发
          </button>
        ) : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-violet-500 transition-[width]"
          style={{
            width: `${Math.round((ts.completed / Math.max(ts.total, 1)) * 100)}%`,
          }}
        />
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">
        {ts.completed}/{ts.total} 已完成
      </p>
    </section>
  );
}
