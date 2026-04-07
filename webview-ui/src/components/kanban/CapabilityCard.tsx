/**
 * 能力卡片（拖拽手柄 + 点击打开详情）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.3
 */
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { Capability } from "@/types/observatory";
import { draggableId, getCapabilityUpdatedIso } from "@/lib/kanban-utils";
import { isSddCapability } from "@/lib/sdd-utils";
import { formatDateTimeZh } from "@/lib/format-time";

type Props = {
  capability: Capability;
  selected: boolean;
  onOpenDetail: (c: Capability) => void;
};

export function CapabilityCard({
  capability: cap,
  selected,
  onOpenDetail,
}: Props) {
  const sddLocked = isSddCapability(cap);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: draggableId(cap.id),
      disabled: sddLocked,
      data: { type: "capability", capabilityId: cap.id },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const title = String(cap.title ?? cap.id);
  const updatedIso = getCapabilityUpdatedIso(cap);
  const progress =
    typeof cap.progress === "number" && !Number.isNaN(cap.progress)
      ? Math.round(Math.min(100, Math.max(0, cap.progress)))
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-1.5 rounded-md border bg-white px-2 py-2 text-left shadow-sm transition dark:bg-[#32324a] ${
        selected
          ? "border-violet-500 ring-1 ring-violet-500/30"
          : "border-zinc-200 dark:border-zinc-600"
      } ${sddLocked ? "ring-1 ring-amber-400/40" : ""} ${
        isDragging ? "z-10 cursor-grabbing opacity-60 shadow-lg" : "opacity-100"
      }`}
    >
      <button
        type="button"
        className={`mt-0.5 shrink-0 touch-none rounded p-0.5 ${
          sddLocked
            ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
            : "cursor-grab text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        }`}
        aria-label={sddLocked ? "SDD 能力阶段由文档同步，不可拖拽" : "拖拽以调整阶段"}
        {...(sddLocked ? {} : listeners)}
        {...(sddLocked ? {} : attributes)}
        disabled={sddLocked}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onOpenDetail(cap)}
      >
        <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {sddLocked ? <span title="SDD">📋 </span> : null}
          {cap.sdd?.activeFeature ? (
            <span className="mr-1 text-amber-600 dark:text-amber-400" title="当前活跃 feature">
              ●
            </span>
          ) : null}
          {title}
        </span>
        {typeof cap.bugfix?.activeBugs === "number" && cap.bugfix.activeBugs > 0 ? (
          <span
            className="mt-0.5 inline-flex rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
            title="未关闭 Bug"
          >
            {cap.bugfix.activeBugs}
          </span>
        ) : null}
        <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
          {cap.id}
        </span>
        {updatedIso ? (
          <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
            {formatDateTimeZh(updatedIso)}
          </span>
        ) : null}
        {progress != null ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-violet-500 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </button>
    </div>
  );
}
