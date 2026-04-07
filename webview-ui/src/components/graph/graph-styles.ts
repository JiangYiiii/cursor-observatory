/**
 * Cytoscape 样式：按 layer 着色、按代码量/引用调整大小与边宽。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.2
 */
import type { Stylesheet } from "cytoscape";

const LAYER: Record<
  string,
  { fill: string; border: string }
> = {
  presentation: { fill: "#3b82f6", border: "#1e40af" },
  business: { fill: "#22c55e", border: "#166534" },
  data: { fill: "#a855f7", border: "#6b21a8" },
  infrastructure: { fill: "#f59e0b", border: "#b45309" },
  unknown: { fill: "#71717a", border: "#3f3f46" },
};

const LAYER_DARK: Record<
  string,
  { fill: string; border: string }
> = {
  presentation: { fill: "#60a5fa", border: "#1d4ed8" },
  business: { fill: "#4ade80", border: "#15803d" },
  data: { fill: "#c084fc", border: "#7e22ce" },
  infrastructure: { fill: "#fbbf24", border: "#d97706" },
  unknown: { fill: "#a1a1aa", border: "#52525b" },
};

export function getGraphStylesheet(dark: boolean): Stylesheet[] {
  const pal = dark ? LAYER_DARK : LAYER;
  const text = dark ? "#e4e4e7" : "#18181b";
  const edgeColor = dark ? "#71717a" : "#a1a1aa";
  const arrow = dark ? "#a1a1aa" : "#71717a";

  const layerRules: Stylesheet[] = Object.keys(LAYER).map((layer) => ({
    selector: `node[layer = "${layer}"]`,
    style: {
      "background-color": pal[layer]?.fill ?? pal.unknown.fill,
      "border-color": pal[layer]?.border ?? pal.unknown.border,
    },
  }));

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        width: "mapData(total_lines, 0, 8000, 28, 88)",
        height: "mapData(total_lines, 0, 8000, 28, 88)",
        "font-size": 10,
        color: text,
        "text-valign": "center",
        "text-halign": "center",
        "border-width": 2,
        "text-wrap": "ellipsis",
        "text-max-width": "80px",
        "background-color": pal.unknown.fill,
        "border-color": pal.unknown.border,
      },
    },
    ...layerRules,
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": dark ? "#fbbf24" : "#ca8a04",
      },
    },
    {
      selector: "edge",
      style: {
        width: "mapData(weight, 1, 30, 1, 10)",
        "line-color": edgeColor,
        "target-arrow-color": arrow,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.9,
        opacity: 0.85,
      },
    },
  ];
}
