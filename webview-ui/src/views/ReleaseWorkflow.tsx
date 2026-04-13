import { useEffect, useMemo, useState } from "react";
import { Rocket } from "lucide-react";
import { useReleaseStore } from "@/store/release-store";
import {
  EnvStatusBanner,
  ImageSelectorBar,
  ActionBar,
  PipelineTable,
  PipelineNodeTimeline,
  TrafficControlPanel,
  BatchDeployDialog,
  BatchTrafficDialog,
  CurlImportDialog,
} from "@/components/release";

export function ReleaseWorkflow() {
  const store = useReleaseStore();
  const stageSummaries = useReleaseStore((s) => s.stageSummaries);
  const expandedPipelinesState = useReleaseStore((s) => s.expandedPipelines);

  const {
    pipelines,
    selectedPipelines,
    loading,
    batchOperationInProgress,
  } = store;

  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [showTrafficDialog, setShowTrafficDialog] = useState(false);
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [batchTrafficTargetGreen, setBatchTrafficTargetGreen] = useState(50);

  useEffect(() => {
    store.loadEnvStatus();
    store.loadPipelines();
    store.startPolling();
    return () => store.stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pipelines.length > 0) {
      store.loadAllImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelines.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        store.manualRefreshPipelines();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        store.selectAllDeployable();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        store.deselectAllPipelines();
      }
      if (e.key === "Escape") {
        if (batchOperationInProgress) {
          store.cancelBatchOperation();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchOperationInProgress]);

  const hasSelectedCanary = selectedPipelines.some((name) => {
    const p = pipelines.find((pp) => pp.name === name);
    return p?.hasCanary;
  });

  /** 待人工/交互时始终展示节点时间线，避免必须点击表格行「展开」才能看到继续/终止 */
  const pipelineNamesWithNodeTimeline = useMemo(() => {
    const manual = pipelines
      .filter((p) => {
        const st = stageSummaries[p.name];
        return Boolean(st?.requiresManualAction && st?.runId);
      })
      .map((p) => p.name);
    return [...new Set([...expandedPipelinesState, ...manual])];
  }, [pipelines, stageSummaries, expandedPipelinesState]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="size-5 text-blue-600 dark:text-blue-400" aria-hidden />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            生产发布
          </h2>
          {loading.pipelines && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              加载中…
            </span>
          )}
        </div>
      </div>

      {/* 环境状态横幅 */}
      <EnvStatusBanner />

      {/* 镜像选择区 */}
      <ImageSelectorBar />

      {/* 操作工具栏 */}
      <ActionBar
        onOpenBatchTraffic={async () => {
          const names = selectedPipelines.filter((n) => {
            const p = pipelines.find((pp) => pp.name === n);
            return p?.hasCanary;
          });
          await store.prepareBatchTrafficDialog(names);
          setShowTrafficDialog(true);
        }}
      />

      {/* 流水线列表 */}
      <PipelineTable />

      {/* 展开行或「待人工」的流水线均显示节点时间线（否则用户看不到交互按钮） */}
      {pipelineNamesWithNodeTimeline.map((name) => (
        <PipelineNodeTimeline key={name} pipelineName={name} />
      ))}

      {/* 蓝绿切流面板（选中 canary 类型时展示） */}
      {hasSelectedCanary && <TrafficControlPanel />}

      {/* 弹窗组件 */}
      <BatchDeployDialog
        open={showDeployDialog}
        onClose={() => setShowDeployDialog(false)}
      />
      <BatchTrafficDialog
        open={showTrafficDialog}
        onClose={() => setShowTrafficDialog(false)}
        pipelines={selectedPipelines.filter((name) => pipelines.find((p) => p.name === name)?.hasCanary)}
        skippedNonCanaryCount={
          selectedPipelines.filter((name) => !pipelines.find((p) => p.name === name)?.hasCanary).length
        }
        targetGreenPercent={batchTrafficTargetGreen}
        onTargetGreenPercentChange={setBatchTrafficTargetGreen}
      />
      <CurlImportDialog
        open={showCurlImport}
        onClose={() => setShowCurlImport(false)}
      />
    </div>
  );
}
