import { useEffect } from "react";
import { useReleaseStore } from "@/store/release-store";
import type { PipelineNode } from "@/types/observatory";
import { ArrowRight, Loader2 } from "lucide-react";
import { NodeCard } from "./NodeCard";

/** 选择器内必须用稳定引用；`?? []` 每次会新建数组，触发 Zustand 无限更新（React #185）。 */
const EMPTY_NODES: PipelineNode[] = [];

export function PipelineNodeTimeline({ pipelineName }: { pipelineName: string }) {
  const nodes = useReleaseStore((s) => s.runNodesByPipeline[pipelineName] ?? EMPTY_NODES);
  const loading = useReleaseStore((s) => s.pipelineNodesLoading[pipelineName] ?? false);
  const stageSummaries = useReleaseStore((s) => s.stageSummaries);
  const loadPipelineNodes = useReleaseStore((s) => s.loadPipelineNodes);

  const stage = stageSummaries[pipelineName];
  const runId = stage?.runId ?? "";
  const jenkinsBuildId = stage?.jenkinsBuildId;

  useEffect(() => {
    const st = stageSummaries[pipelineName];
    if (st?.runId) {
      void loadPipelineNodes(st.runId, pipelineName);
    }
  }, [pipelineName, stageSummaries, loadPipelineNodes]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <h3 className="mb-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        {pipelineName}
      </h3>

      {loading && nodes.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-xs text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载节点详情…
        </div>
      ) : nodes.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-400">
          暂无运行记录
        </p>
      ) : (
        <div className="flex items-start gap-1 overflow-x-auto pb-2">
          {nodes.map((node, idx) => (
            <div key={node.id} className="flex shrink-0 items-center gap-1">
              <NodeCard
                node={node}
                pipelineName={pipelineName}
                runId={runId}
                jenkinsBuildId={jenkinsBuildId}
              />
              {idx < nodes.length - 1 && (
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
