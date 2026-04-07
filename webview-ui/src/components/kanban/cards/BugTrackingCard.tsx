import type { Capability } from "@/types/observatory";

type Props = {
  cap: Capability;
  bugDraft: string;
  onBugDraftChange: (v: string) => void;
  onBugfix: () => void;
};

export function BugTrackingCard({
  cap,
  bugDraft,
  onBugDraftChange,
  onBugfix,
}: Props) {
  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Bug 追踪
        </h3>
        <button
          type="button"
          onClick={onBugfix}
          className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700"
        >
          Bug 修复
        </button>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        未关闭：{cap.bugfix?.activeBugs ?? 0} · 已关闭：
        {cap.bugfix?.resolvedBugs ?? 0}
      </p>
      {cap.bugfix?.rootCauses?.length ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          根因：{cap.bugfix.rootCauses.join(", ")}
        </p>
      ) : null}
      <label className="mt-2 block text-[10px] text-zinc-500">
        新 Bug 描述（可选；留空则按 bugfix-log 中 OPEN 项修复）
        <textarea
          value={bugDraft}
          onChange={(e) => onBugDraftChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-zinc-200 bg-white p-1.5 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          placeholder="现象、复现步骤…"
        />
      </label>
    </section>
  );
}
