/**
 * 全屏/大尺寸弹窗中查看 ER 图（与内嵌 ERDiagram 共用同一份 Mermaid 定义）。
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ERDiagram } from "./ERDiagram";

type Props = {
  open: boolean;
  onClose: () => void;
  definition: string;
  dark: boolean;
};

export function ERDiagramLightbox({ open, onClose, definition, dark }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="w-[min(96vw,1400px)] max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/50 dark:border-zinc-600 dark:bg-[#2a2a3c] dark:text-zinc-100"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="flex max-h-[min(92vh,900px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold">数据模型 ER — 放大查看</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
          <ERDiagram definition={definition} dark={dark} />
        </div>
      </div>
    </dialog>
  );
}
