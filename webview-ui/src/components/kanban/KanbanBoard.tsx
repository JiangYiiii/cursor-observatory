/**
 * 能力看板：跨列拖拽更新 phase。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.3
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import type { Capability, CapabilityPhase } from "@/types/observatory";
import {
  KANBAN_PHASES,
  normalizePhase,
  parseDraggableId,
  parseDroppableId,
} from "@/lib/kanban-utils";
import { isSddCapability } from "@/lib/sdd-utils";
import { CapabilityCardPreview } from "./CapabilityCardPreview";
import { KanbanColumn } from "./KanbanColumn";

type Props = {
  grouped: Record<CapabilityPhase, Capability[]>;
  onPhaseChange: (id: string, phase: CapabilityPhase) => void;
  selectedId: string | null;
  onSelectCard: (c: Capability) => void;
};

export function KanbanBoard({
  grouped,
  onPhaseChange,
  selectedId,
  onSelectCard,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const flat = useMemo(
    () => KANBAN_PHASES.flatMap((p) => grouped[p]),
    [grouped]
  );

  const activeCap = useMemo(
    () => (activeId ? flat.find((c) => c.id === activeId) ?? null : null),
    [activeId, flat]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  function onDragStart(ev: DragStartEvent) {
    const id = parseDraggableId(ev.active.id);
    setActiveId(id);
  }

  function onDragEnd(ev: DragEndEvent) {
    setActiveId(null);
    const { active, over } = ev;
    if (!over) return;

    const capId = parseDraggableId(active.id);
    const newPhase = parseDroppableId(String(over.id));
    if (!capId || !newPhase) return;

    const current = flat.find((c) => c.id === capId);
    if (!current) return;
    if (isSddCapability(current)) return;
    if (normalizePhase(current.phase) === newPhase) {
      return;
    }
    onPhaseChange(capId, newPhase);
  }

  function onDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {KANBAN_PHASES.map((phase) => (
            <KanbanColumn
              key={phase}
              phase={phase}
              items={grouped[phase]}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCap ? (
          <div className="w-[260px] cursor-grabbing opacity-95">
            <CapabilityCardPreview capability={activeCap} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
