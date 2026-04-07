/**
 * 拖拽跟随预览（无 DnD 注册，避免与列表项 id 冲突）。
 */
import { GripVertical } from "lucide-react";
import type { Capability } from "@/types/observatory";

type Props = {
  capability: Capability;
};

export function CapabilityCardPreview({ capability: cap }: Props) {
  const title = String(cap.title ?? cap.id);
  const progress =
    typeof cap.progress === "number" && !Number.isNaN(cap.progress)
      ? Math.round(Math.min(100, Math.max(0, cap.progress)))
      : null;

  return (
    <div className="flex gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-2 text-left shadow-xl dark:border-zinc-600 dark:bg-[#32324a]">
      <span
        className="mt-0.5 shrink-0 p-0.5 text-zinc-300 dark:text-zinc-600"
        aria-hidden
      >
        <GripVertical className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
          {cap.id}
        </span>
        {progress != null ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
