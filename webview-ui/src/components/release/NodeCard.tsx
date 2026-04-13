import { useState, useCallback } from "react";
import type { PipelineNode } from "@/types/observatory";
import { useReleaseStore } from "@/store/release-store";
import { CheckCircle, Circle, Loader2, PauseCircle, XCircle, Ban } from "lucide-react";

interface NodeCardProps {
  node: PipelineNode;
  pipelineName: string;
  runId: string;
  /** Jenkins build 号，与 runId（PipelineRun 名）不同时需传入，否则 SubmitInputStep 易 500 */
  jenkinsBuildId?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  SUCCESS: <CheckCircle className="h-4 w-4 text-green-500" />,
  IN_PROGRESS: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  PAUSED: <PauseCircle className="h-4 w-4 text-amber-500" />,
  UNKNOWN: <PauseCircle className="h-4 w-4 text-amber-500" />,
  NOT_BUILT: <Circle className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />,
  FAILED: <XCircle className="h-4 w-4 text-red-500" />,
  ABORTED: <Ban className="h-4 w-4 text-zinc-400" />,
};

function formatDuration(ms?: number): string {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

export function NodeCard({ node, pipelineName, runId, jenkinsBuildId }: NodeCardProps) {
  const submitPipelineRunInput = useReleaseStore((s) => s.submitPipelineRunInput);
  const [pending, setPending] = useState(false);

  /** 与扩展归一化一致；UNKNOWN 且含 input 时仍应可操作 */
  const isPaused =
    node.status === "PAUSED" ||
    (node.status === "UNKNOWN" && Boolean(node.pausedInput?.inputId));
  const isFailed = node.status === "FAILED";
  const canInput = Boolean(
    isPaused && node.pausedInput?.inputId && runId && !pending,
  );

  const onProceed = useCallback(async () => {
    if (!node.pausedInput?.inputId || !runId) return;
    setPending(true);
    try {
      await submitPipelineRunInput(
        pipelineName,
        runId,
        node.pausedInput.nodeId,
        node.pausedInput.stepId,
        node.pausedInput.inputId,
        false,
        jenkinsBuildId,
      );
    } finally {
      setPending(false);
    }
  }, [jenkinsBuildId, node.pausedInput, pipelineName, runId, submitPipelineRunInput]);

  const onAbort = useCallback(async () => {
    if (!node.pausedInput?.inputId || !runId) return;
    setPending(true);
    try {
      await submitPipelineRunInput(
        pipelineName,
        runId,
        node.pausedInput.nodeId,
        node.pausedInput.stepId,
        node.pausedInput.inputId,
        true,
        jenkinsBuildId,
      );
    } finally {
      setPending(false);
    }
  }, [jenkinsBuildId, node.pausedInput, pipelineName, runId, submitPipelineRunInput]);

  return (
    <div
      className={[
        "flex min-w-[160px] max-w-[220px] shrink-0 flex-col gap-1.5 rounded-lg border px-3 py-2.5",
        isPaused
          ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/20"
          : isFailed
            ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {STATUS_ICON[node.status] ?? <Circle className="h-4 w-4 text-zinc-300" />}
        <span className="text-[11px] font-medium text-zinc-900 dark:text-zinc-200">
          {node.displayName}
        </span>
      </div>

      {node.duration != null && node.duration > 0 && (
        <span className="text-[10px] text-zinc-400">
          {formatDuration(node.duration)}
        </span>
      )}

      {isPaused && (
        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
          {node.pauseDescription ?? "需要操作"}
        </span>
      )}

      {canInput && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onProceed()}
            className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "…" : "继续"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onAbort()}
            className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            终止
          </button>
        </div>
      )}
    </div>
  );
}
