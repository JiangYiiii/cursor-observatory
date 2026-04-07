/**
 * 看板单列（droppable）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.3
 */
import { useDroppable } from "@dnd-kit/core";
import type { Capability, CapabilityPhase } from "@/types/observatory";
import { droppableId, PHASE_TITLE } from "@/lib/kanban-utils";
import { CapabilityCard } from "./CapabilityCard";

type Props = {
  phase: CapabilityPhase;
  items: Capability[];
  selectedId: string | null;
  onSelectCard: (c: Capability) => void;
};

export function KanbanColumn({
  phase,
  items,
  selectedId,
  onSelectCard,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId(phase),
    data: { type: "column", phase },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[min(100%,280px)] shrink-0 flex-col rounded-lg border bg-zinc-50/80 dark:bg-zinc-900/40 ${
        isOver
          ? "border-violet-400 ring-2 ring-violet-400/30 dark:border-violet-500"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          {PHASE_TITLE[phase]}
        </h3>
        <p className="text-[10px] text-zinc-400 tabular-nums dark:text-zinc-500">
          {items.length} 项
        </p>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
            拖入卡片
          </p>
        ) : (
          items.map((c) => (
            <CapabilityCard
              key={c.id}
              capability={c}
              selected={selectedId === c.id}
              onOpenDetail={onSelectCard}
            />
          ))
        )}
      </div>
    </div>
  );
}
