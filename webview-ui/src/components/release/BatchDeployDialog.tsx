import { useState, useCallback, useEffect } from "react";
import { useReleaseStore } from "@/store/release-store";
import type { BatchOperationItemResult } from "@/types/observatory";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Ban,
  Loader2,
  X,
} from "lucide-react";

interface BatchDeployDialogProps {
  open: boolean;
  onClose: () => void;
}

type Phase = "confirm" | "executing" | "result";

const STATUS_ICON: Record<string, React.ReactNode> = {
  applied: <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />,
  skipped: <RotateCcw className="h-4 w-4 text-zinc-400" />,
  conflicted: <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />,
  failed: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
  cancelled: <Ban className="h-4 w-4 text-zinc-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  applied: "已部署",
  skipped: "已跳过",
  conflicted: "冲突",
  failed: "失败",
  cancelled: "已取消",
};

export function BatchDeployDialog({ open, onClose }: BatchDeployDialogProps) {
  const pipelines = useReleaseStore((s) => s.pipelines);
  const selectedPipelines = useReleaseStore((s) => s.selectedPipelines);
  const selectedImage = useReleaseStore((s) => s.selectedImage);
  const imageIndex = useReleaseStore((s) => s.imageIndex);
  const batchDeploy = useReleaseStore((s) => s.batchDeploy);
  const cancelBatchOperation = useReleaseStore((s) => s.cancelBatchOperation);
  const batchProgress = useReleaseStore((s) => s.batchProgress);
  const deploying = useReleaseStore((s) => s.loading.deploying);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [results, setResults] = useState<BatchOperationItemResult[]>([]);

  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setResults([]);
    }
  }, [open]);

  const deployItems = selectedPipelines
    .map((name) => pipelines.find((p) => p.name === name))
    .filter((p) => {
      if (!p) return false;
      if (!selectedImage) return true;
      const tags = imageIndex[p.repoName];
      return !!tags && tags.includes(selectedImage);
    })
    .sort((a, b) => (a!.deployOrder ?? 999) - (b!.deployOrder ?? 999));

  const handleExecute = useCallback(async () => {
    setPhase("executing");
    const { results: res } = await batchDeploy();
    setResults(res);
    setPhase("result");
  }, [batchDeploy]);

  const handleRetryFailed = useCallback(async () => {
    const failedNames = results.filter((r) => r.status === "failed").map((r) => r.pipeline);
    if (failedNames.length === 0) return;
    const store = useReleaseStore.getState();
    store.deselectAllPipelines();
    for (const name of failedNames) {
      store.togglePipelineSelection(name);
    }
    setPhase("executing");
    const { results: res } = await store.batchDeploy();
    setResults(res);
    setPhase("result");
  }, [results]);

  if (!open) return null;

  const failedCount = results.filter((r) => r.status === "failed").length;
  const title = "批量部署";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-0 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-80 overflow-y-auto px-4 py-3">
          {phase === "confirm" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                即将部署 {deployItems.length} 条流水线
                {selectedImage && (
                  <span className="ml-1 font-mono text-zinc-700 dark:text-zinc-200">{selectedImage}</span>
                )}
              </p>
              <ul className="space-y-1">
                {deployItems.map((p, i) => (
                  <li key={p!.name} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="w-5 text-right text-zinc-400">{i + 1}.</span>
                    <span className="font-medium">{p!.name}</span>
                    <span className="text-zinc-400">→</span>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      {p!.fullModuleName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase === "executing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {batchProgress
                  ? `已完成 ${batchProgress.completed}/${batchProgress.total}`
                  : "正在执行…"}
              </div>
              {batchProgress && (
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                    style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {phase === "result" && (
            <ul className="space-y-1.5">
              {results.map((r) => (
                <li key={r.pipeline} className="flex items-start gap-2 text-xs">
                  {STATUS_ICON[r.status] ?? STATUS_ICON.failed}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.pipeline}</span>
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">{STATUS_LABEL[r.status]}</span>
                    {r.message && (
                      <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{r.message}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          {phase === "confirm" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecute}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                确认部署
              </button>
            </>
          )}
          {phase === "executing" && (
            <button
              type="button"
              onClick={cancelBatchOperation}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-zinc-700"
            >
              取消
            </button>
          )}
          {phase === "result" && (
            <>
              {failedCount > 0 && (
                <button
                  type="button"
                  disabled={deploying}
                  onClick={handleRetryFailed}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  仅重试失败项
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                关闭
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
