import { Focus, LayoutGrid, Network, ZoomIn, ZoomOut } from "lucide-react";
import type { CyGraphApi, GraphLayoutMode } from "./graph-types";

export type { GraphLayoutMode } from "./graph-types";

type Props = {
  layout: GraphLayoutMode;
  onLayoutChange: (mode: GraphLayoutMode) => void;
  api: CyGraphApi | null;
  disabled?: boolean;
};

export function GraphControls({
  layout,
  onLayoutChange,
  api,
  disabled,
}: Props) {
  const off = disabled || !api;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">布局</span>
      <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-800">
        <button
          type="button"
          disabled={off}
          onClick={() => onLayoutChange("dagre")}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
            layout === "dagre"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200"
              : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
          title="分层（Dagre）"
        >
          <LayoutGrid className="size-3.5" aria-hidden />
          分层
        </button>
        <button
          type="button"
          disabled={off}
          onClick={() => onLayoutChange("cose")}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
            layout === "cose"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200"
              : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
          title="力导向（COSE）"
        >
          <Network className="size-3.5" aria-hidden />
          力导向
        </button>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={off}
          onClick={() => api?.fit()}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          title="适应画布"
        >
          <Focus className="size-3.5" aria-hidden />
          适应
        </button>
        <button
          type="button"
          disabled={off}
          onClick={() => api?.zoomOut()}
          className="rounded-md border border-zinc-200 p-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
          aria-label="缩小"
        >
          <ZoomOut className="size-4" />
        </button>
        <button
          type="button"
          disabled={off}
          onClick={() => api?.zoomIn()}
          className="rounded-md border border-zinc-200 p-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
          aria-label="放大"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>
    </div>
  );
}
