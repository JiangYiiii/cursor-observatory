import { useMemo } from "react";
import { useReleaseStore } from "@/store/release-store";
import { AlertTriangle, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { PipelineInfo } from "@/types/observatory";

export function PipelineTable() {
  const pipelines = useReleaseStore((s) => s.pipelines);
  const selectedPipelines = useReleaseStore((s) => s.selectedPipelines);
  const selectedImage = useReleaseStore((s) => s.selectedImage);
  const pipelineSearch = useReleaseStore((s) => s.pipelineSearch);
  const pipelineGroupBy = useReleaseStore((s) => s.pipelineGroupBy);
  const pipelineSortBy = useReleaseStore((s) => s.pipelineSortBy);
  const stageSummaries = useReleaseStore((s) => s.stageSummaries);
  const getPipelineDeployability = useReleaseStore((s) => s.getPipelineDeployability);
  const togglePipelineSelection = useReleaseStore((s) => s.togglePipelineSelection);
  const selectAllDeployable = useReleaseStore((s) => s.selectAllDeployable);
  const deselectAllPipelines = useReleaseStore((s) => s.deselectAllPipelines);
  const toggleExpandedPipeline = useReleaseStore((s) => s.toggleExpandedPipeline);
  const setPipelineSearch = useReleaseStore((s) => s.setPipelineSearch);
  const setPipelineGroupBy = useReleaseStore((s) => s.setPipelineGroupBy);
  const setPipelineSortBy = useReleaseStore((s) => s.setPipelineSortBy);
  const pipelineFilterDeployableOnly = useReleaseStore((s) => s.pipelineFilterDeployableOnly);
  const setPipelineFilterDeployableOnly = useReleaseStore((s) => s.setPipelineFilterDeployableOnly);
  const expandedPipelines = useReleaseStore((s) => s.expandedPipelines);
  const imageIndex = useReleaseStore((s) => s.imageIndex);
  const loading = useReleaseStore((s) => s.loading.pipelines);

  const filtered = useMemo(() => {
    let list = [...pipelines];
    if (pipelineSearch) {
      const kw = pipelineSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(kw) ||
          p.moduleName.toLowerCase().includes(kw)
      );
    }
    if (pipelineFilterDeployableOnly && selectedImage) {
      list = list.filter((p) => getPipelineDeployability(p.name).deployable);
    }
    return list;
  }, [
    pipelines,
    pipelineSearch,
    pipelineFilterDeployableOnly,
    selectedImage,
    imageIndex,
    getPipelineDeployability,
  ]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (pipelineSortBy === "attention") {
      const attentionOrder: Record<string, number> = {
        failed: 0,
        waiting_manual: 1,
        waiting_release: 1,
        waiting_gray_confirm: 1,
        waiting_bluegreen_switch: 1,
        deploying: 2,
        idle: 3,
        succeeded: 4,
        aborted: 5,
        unknown: 6,
      };
      list.sort((a, b) => {
        const sa = stageSummaries[a.name]?.stageType ?? "unknown";
        const sb = stageSummaries[b.name]?.stageType ?? "unknown";
        return (attentionOrder[sa] ?? 99) - (attentionOrder[sb] ?? 99);
      });
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [filtered, pipelineSortBy, stageSummaries]);

  const grouped = useMemo(() => {
    if (pipelineGroupBy === "none") {
      return [{ key: "", label: "", pipelines: sorted }];
    }
    if (pipelineGroupBy === "blue_green") {
      const support: PipelineInfo[] = [];
      const rest: PipelineInfo[] = [];
      for (const p of sorted) {
        if (p.hasCanary) support.push(p);
        else rest.push(p);
      }
      const rows: { key: string; label: string; pipelines: PipelineInfo[] }[] = [];
      if (support.length > 0) {
        rows.push({
          key: "ks_blue_green",
          label: "支持蓝绿切流（KubeSphere 注解为 blue_green）",
          pipelines: support,
        });
      }
      if (rest.length > 0) {
        rows.push({
          key: "non_bg",
          label: "非蓝绿（滚动发布、构建链等）",
          pipelines: rest,
        });
      }
      return rows.length > 0 ? rows : [{ key: "", label: "", pipelines: sorted }];
    }
    const groups = new Map<string, PipelineInfo[]>();
    for (const p of sorted) {
      const key = p.pipelineType;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return [...groups.entries()].map(([key, pps]) => ({
      key,
      label: key === "canary" ? "canary 类型（对客服务）" : key === "prod" ? "prod 类型（内部服务）" : key,
      pipelines: pps,
    }));
  }, [sorted, pipelineGroupBy]);

  const allChecked = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((p) => selectedPipelines.includes(p.name));
  }, [filtered, selectedPipelines]);

  function handleToggleAll() {
    if (allChecked) {
      deselectAllPipelines();
    } else {
      selectAllDeployable();
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={pipelineSearch}
            onChange={(e) => setPipelineSearch(e.target.value)}
            placeholder="搜索流水线…"
            className="w-full rounded border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          分组:
          <select
            value={pipelineGroupBy}
            onChange={(e) =>
              setPipelineGroupBy(e.target.value as "type" | "none" | "blue_green")
            }
            className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="blue_green">按蓝绿能力</option>
            <option value="type">按流水线名类型（-cd-canary / -cd-prod）</option>
            <option value="none">不分组</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          排序:
          <select
            value={pipelineSortBy}
            onChange={(e) => setPipelineSortBy(e.target.value as "name" | "attention")}
            className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="attention">需关注优先</option>
            <option value="name">按名称</option>
          </select>
        </label>
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400"
          title={selectedImage ? undefined : "请先选择目标镜像"}
        >
          <input
            type="checkbox"
            checked={pipelineFilterDeployableOnly}
            disabled={!selectedImage}
            onChange={(e) => setPipelineFilterDeployableOnly(e.target.checked)}
            className="rounded disabled:cursor-not-allowed disabled:opacity-50"
          />
          仅显示可部署此镜像的流水线
        </label>
      </div>

      {loading && pipelines.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-zinc-400">
          正在加载流水线…
        </div>
      ) : pipelines.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-zinc-400">
          暂无流水线数据
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/80">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={handleToggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">流水线名称</th>
                <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">模块</th>
                <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">类型</th>
                <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">当前阶段</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <PipelineGroup
                  key={group.key || "__all"}
                  label={group.label}
                  pipelines={group.pipelines}
                  selectedPipelines={selectedPipelines}
                  selectedImage={selectedImage}
                  stageSummaries={stageSummaries}
                  expandedPipelines={expandedPipelines}
                  getPipelineDeployability={getPipelineDeployability}
                  onToggle={togglePipelineSelection}
                  onToggleExpand={toggleExpandedPipeline}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PipelineGroup({
  label,
  pipelines,
  selectedPipelines,
  selectedImage,
  stageSummaries,
  expandedPipelines,
  getPipelineDeployability,
  onToggle,
  onToggleExpand,
}: {
  label: string;
  pipelines: PipelineInfo[];
  selectedPipelines: string[];
  selectedImage: string;
  stageSummaries: Record<string, import("@/types/observatory").PipelineStageSummary>;
  expandedPipelines: string[];
  getPipelineDeployability: (name: string) => { deployable: boolean; reason?: string };
  onToggle: (name: string) => void;
  onToggleExpand: (name: string) => void;
}) {
  return (
    <>
      {label && (
        <tr>
          <td
            colSpan={5}
            className="bg-zinc-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400"
          >
            {label}
          </td>
        </tr>
      )}
      {pipelines.map((p) => {
        const { deployable, reason } = getPipelineDeployability(p.name);
        const disabled = !!selectedImage && !deployable;
        const isSelected = selectedPipelines.includes(p.name);
        const isExpanded = expandedPipelines.includes(p.name);
        const stage = stageSummaries[p.name];

        return (
          <tr
            key={p.name}
            onClick={() => onToggleExpand(p.name)}
            title={disabled ? reason : undefined}
            className={[
              "cursor-pointer border-b border-zinc-100 transition-colors dark:border-zinc-700/50",
              disabled && "opacity-50",
              isExpanded
                ? "bg-cyan-50/50 dark:bg-cyan-950/20"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/80",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={disabled}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggle(p.name);
                }}
                onClick={(e) => e.stopPropagation()}
                className="rounded disabled:cursor-not-allowed"
              />
            </td>
            <td className="px-3 py-2 font-mono text-zinc-900 dark:text-zinc-200">
              <span className="flex items-center gap-1.5">
                {p.name}
                {p.mappingSource === "inferred" && (
                  <span title="此映射为自动推断，建议在配置中显式指定">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{p.moduleName}</td>
            <td
              className="px-3 py-2"
              title={
                p.ksPipelineType
                  ? `KubeSphere: ${p.ksPipelineType}`
                  : undefined
              }
            >
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  p.pipelineType === "canary"
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : p.pipelineType === "prod"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700/40 dark:text-zinc-400"
                }`}
              >
                {p.pipelineType}
              </span>
              {p.ksPipelineType && (
                <span className="ml-1.5 text-[9px] text-zinc-400 dark:text-zinc-500">
                  KS:{p.ksPipelineType}
                </span>
              )}
            </td>
            <td className="px-3 py-2">
              {stage ? (
                <StatusBadge
                  status={stage.stageType}
                  label={stage.stageLabel}
                />
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
