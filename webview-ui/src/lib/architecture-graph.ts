/**
 * architecture.json → Cytoscape elements。
 * primary_doc: docs/SCHEMA_SPEC.md §三
 */
import type { Core, ElementDefinition } from "cytoscape";
import type { Architecture } from "@/types/observatory";

export function resolveModuleLayer(
  architecture: Architecture,
  moduleId: string
): string {
  const layers = architecture.layers as
    | Array<{ name: string; modules: string[] }>
    | undefined;
  if (!layers) return "unknown";
  for (const L of layers) {
    if (L.modules?.includes(moduleId)) return L.name;
  }
  return "unknown";
}

export function buildCyElements(architecture: Architecture): ElementDefinition[] {
  const modules = architecture.modules ?? [];
  const modIds = new Set(modules.map((m) => m.id));

  const nodes: ElementDefinition[] = modules.map((m) => {
    const stats = m.stats as { total_lines?: number } | undefined;
    const lines = stats?.total_lines ?? 0;
    const layer = resolveModuleLayer(architecture, m.id);
    return {
      data: {
        id: m.id,
        label: String(m.name ?? m.id),
        total_lines: lines,
        layer,
      },
    };
  });

  const edges: ElementDefinition[] = [];
  let ei = 0;
  for (const e of architecture.edges ?? []) {
    if (!modIds.has(e.from) || !modIds.has(e.to)) continue;
    edges.push({
      data: {
        id: `e${ei++}`,
        source: e.from,
        target: e.to,
        weight: typeof e.weight === "number" ? e.weight : 1,
      },
    });
  }

  return [...nodes, ...edges];
}

export function runLayout(cy: Core, layoutName: "dagre" | "cose"): void {
  if (layoutName === "dagre") {
    cy.layout({
      name: "dagre",
      rankDir: "TB",
      nodeSep: 48,
      rankSep: 72,
      edgeSep: 12,
      animate: true,
      animationDuration: 200,
      fit: true,
      padding: 40,
    } as Parameters<Core["layout"]>[0]).run();
  } else {
    cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 200,
      fit: true,
      padding: 40,
      nodeRepulsion: () => 4500,
      idealEdgeLength: () => 80,
    } as Parameters<Core["layout"]>[0]).run();
  }
}
