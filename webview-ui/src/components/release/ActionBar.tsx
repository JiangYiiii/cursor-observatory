import { useMemo } from "react";
import { useReleaseStore } from "@/store/release-store";
import { Loader2, RefreshCw, Rocket, Shuffle, XCircle } from "lucide-react";

export interface ActionBarProps {
  /** 打开批量切流确认弹窗（可先拉 canary / 预检） */
  onOpenBatchTraffic?: () => void | Promise<void>;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

function useRefreshAgeColor(lastRefresh: number | null): string {
  if (!lastRefresh) return "text-zinc-400 dark:text-zinc-500";
  const age = Date.now() - lastRefresh;
  if (age < 60_000) return "text-green-600 dark:text-green-400";
  if (age < 300_000) return "text-orange-500 dark:text-orange-400";
  return "text-red-500 dark:text-red-400 animate-pulse";
}

export function ActionBar({ onOpenBatchTraffic }: ActionBarProps) {
  const selectedPipelines = useReleaseStore((s) => s.selectedPipelines);
  const pipelines = useReleaseStore((s) => s.pipelines);
  const selectedImage = useReleaseStore((s) => s.selectedImage);
  const imageIndex = useReleaseStore((s) => s.imageIndex);
  const batchOperationInProgress = useReleaseStore((s) => s.batchOperationInProgress);
  const batchProgress = useReleaseStore((s) => s.batchProgress);
  const loadingPipelines = useReleaseStore((s) => s.loading.pipelines);
  const lastPipelinesRefresh = useReleaseStore((s) => s.lastPipelinesRefresh);

  const batchDeploy = useReleaseStore((s) => s.batchDeploy);
  const cancelBatchOperation = useReleaseStore((s) => s.cancelBatchOperation);
  const manualRefreshPipelines = useReleaseStore((s) => s.manualRefreshPipelines);

  const refreshColor = useRefreshAgeColor(lastPipelinesRefresh);

  const deployableCount = useMemo(() => {
    if (!selectedImage) return selectedPipelines.length;
    return selectedPipelines.filter((name) => {
      const p = pipelines.find((pp) => pp.name === name);
      if (!p) return false;
      const tags = imageIndex[p.repoName];
      return tags?.includes(selectedImage);
    }).length;
  }, [selectedPipelines, pipelines, selectedImage, imageIndex]);

  const canaryCount = useMemo(() => {
    return selectedPipelines.filter((name) => {
      const p = pipelines.find((pp) => pp.name === name);
      return p?.hasCanary;
    }).length;
  }, [selectedPipelines, pipelines]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void batchDeploy()}
          disabled={batchOperationInProgress || deployableCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-700 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Rocket className="h-3.5 w-3.5" />
          批量部署已选 ({deployableCount})
        </button>

        <button
          type="button"
          onClick={() => void onOpenBatchTraffic?.()}
          disabled={batchOperationInProgress || canaryCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Shuffle className="h-3.5 w-3.5" />
          批量切流 ({canaryCount})
        </button>

        {batchOperationInProgress && (
          <button
            type="button"
            onClick={cancelBatchOperation}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-red-700"
          >
            <XCircle className="h-3.5 w-3.5" />
            取消
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => void manualRefreshPipelines()}
            disabled={loadingPipelines || batchOperationInProgress}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {loadingPipelines ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            刷新状态
          </button>

          {lastPipelinesRefresh && (
            <span className={`text-[10px] ${refreshColor}`}>
              上次刷新: {formatTime(lastPipelinesRefresh)}
            </span>
          )}
        </div>
      </div>

      {batchProgress && (
        <div className="mt-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {batchProgress.completed}/{batchProgress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-cyan-600 transition-all duration-300"
              style={{
                width: `${batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
