import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/common";
import type { CyGraphApi, GraphLayoutMode } from "@/components/graph/graph-types";
import { GraphControls } from "@/components/graph/GraphControls";
import { NodeDetail } from "@/components/graph/NodeDetail";
import type { ArchitectureModule } from "@/types/observatory";
import { useObservatoryStore } from "@/store/observatory-store";
import { useThemeStore } from "@/store/theme-store";

const TopologyGraph = lazy(() =>
  import("@/components/graph/TopologyGraph").then((m) => ({
    default: m.TopologyGraph,
  }))
);

export function Architecture() {
  const dark = useThemeStore((s) => s.theme === "dark");
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const architecture = useObservatoryStore((s) => s.architecture);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  const [layout, setLayout] = useState<GraphLayoutMode>("dagre");
  const [cyApi, setCyApi] = useState<CyGraphApi | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const onReady = useCallback((api: CyGraphApi | null) => {
    setCyApi(api);
  }, []);

  const onSelectNode = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const selectedModule = useMemo((): ArchitectureModule | null => {
    if (!selectedId || !architecture?.modules) return null;
    const m = architecture.modules.find((x) => x.id === selectedId);
    return m ?? null;
  }, [architecture, selectedId]);

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载架构数据"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (
    !architecture ||
    !architecture.modules ||
    architecture.modules.length === 0
  ) {
    return (
      <EmptyState
        title="暂无架构拓扑"
        description="请先在工作区执行 Observatory 全量扫描以生成 architecture.json。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <Card title="模块依赖拓扑" subtitle="节点大小≈代码量，边粗细≈引用次数">
          <GraphControls
            layout={layout}
            onLayoutChange={setLayout}
            api={cyApi}
            disabled={!architecture}
          />
          <div className="mt-3">
            <Suspense
              fallback={<LoadingSkeleton variant="card" lines={4} />}
            >
              <TopologyGraph
                architecture={architecture}
                layout={layout}
                dark={dark}
                onSelectNode={onSelectNode}
                onReady={onReady}
              />
            </Suspense>
          </div>
        </Card>
      </div>
      <NodeDetail
        module={selectedModule}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
