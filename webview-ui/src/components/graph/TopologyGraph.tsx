/**
 * Cytoscape 拓扑：模块节点 + 依赖边。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.2
 */
import cytoscape from "cytoscape";
import type { EventObject } from "cytoscape";
import dagre from "cytoscape-dagre";
import { useEffect, useRef } from "react";
import { buildCyElements, runLayout } from "@/lib/architecture-graph";
import type { Architecture } from "@/types/observatory";
import { getGraphStylesheet } from "./graph-styles";
import type { CyGraphApi, GraphLayoutMode } from "./graph-types";

cytoscape.use(dagre);

export type { CyGraphApi, GraphLayoutMode } from "./graph-types";

type Props = {
  architecture: Architecture | null;
  layout: GraphLayoutMode;
  dark: boolean;
  onSelectNode: (id: string | null) => void;
  onReady: (api: CyGraphApi | null) => void;
};

export function TopologyGraph({
  architecture,
  layout,
  dark,
  onSelectNode,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<ReturnType<typeof cytoscape> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !architecture) {
      onReady(null);
      return;
    }

    const elements = buildCyElements(architecture);
    const nodeCount = architecture.modules?.length ?? 0;
    if (nodeCount === 0 || elements.length === 0) {
      onReady(null);
      return;
    }

    const cy = cytoscape({
      container: el,
      elements,
      style: getGraphStylesheet(dark),
      wheelSensitivity: 0.25,
      minZoom: 0.12,
      maxZoom: 3,
    });

    cyRef.current = cy;

    const api: CyGraphApi = {
      fit: (padding = 40) => {
        cy.fit(undefined, padding);
      },
      zoomIn: () => {
        cy.zoom({ level: Math.min(cy.zoom() * 1.2, 3) });
      },
      zoomOut: () => {
        cy.zoom({ level: Math.max(cy.zoom() / 1.2, 0.1) });
      },
    };
    onReady(api);

    const onTap = (e: EventObject) => {
      const t = e.target;
      if (t === cy) {
        onSelectNode(null);
        return;
      }
      if (typeof t.isNode === "function" && t.isNode()) {
        onSelectNode(t.id());
      }
    };
    cy.on("tap", onTap);

    const ro = new ResizeObserver(() => {
      cy.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
      onReady(null);
    };
  }, [architecture, dark, onReady, onSelectNode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(getGraphStylesheet(dark));
  }, [dark]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !architecture) return;
    runLayout(cy, layout);
  }, [layout, architecture]);

  return (
    <div
      ref={containerRef}
      className="h-[min(560px,calc(100vh-12rem))] w-full min-h-[320px] rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40"
      role="application"
      aria-label="架构依赖拓扑图"
    />
  );
}
