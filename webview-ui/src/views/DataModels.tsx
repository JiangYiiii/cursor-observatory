import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Maximize2, Sparkles } from "lucide-react";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/common";
import { ERDiagram, ERDiagramLightbox, TableDetail } from "@/components/er";
import { SourceFilesCollapsible } from "@/components/er/SourceFilesCollapsible";
import {
  buildErMermaid,
  collectNeighborTableKeys,
  filterRelationshipsForTables,
  schemaGroupKey,
  tableKey,
} from "@/lib/er-mermaid";
import { copyToClipboard } from "@/lib/clipboard";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import { useThemeStore } from "@/store/theme-store";
import type { DataModelTable } from "@/types/observatory";

/** Mermaid 超大定义时提示用户（与 ERDiagram 内 maxTextSize 配合） */
const ER_MERMAID_WARN_CHARS = 280_000;

function DataModelAiPromptPanel() {
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || markdown !== null) return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    void getDataSource()
      .getDataModelAiPromptMarkdown()
      .then((t) => {
        if (!cancelled) setMarkdown(t);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, markdown]);

  const handleCopy = useCallback(async () => {
    if (!markdown) return;
    const ok = await copyToClipboard(markdown);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [markdown]);

  return (
    <Card
      title="数据模型生成 Prompt"
      subtitle="与命令「Open Data Model AI Prompt」一致，复制后发给 AI 以生成 `.observatory/data-models.json`"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-left text-sm transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="font-medium text-zinc-800 dark:text-zinc-100">
            点击展开查看完整提示词
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">加载中…</p>
          ) : loadErr ? (
            <p className="text-xs text-red-600 dark:text-red-400">{loadErr}</p>
          ) : markdown ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-600" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      复制全部
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-[min(420px,60vh)] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100">
                {markdown}
              </pre>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function DataModels() {
  const dark = useThemeStore((s) => s.theme === "dark");
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const dataModels = useObservatoryStore((s) => s.dataModels);
  const loadAll = useObservatoryStore((s) => s.loadAll);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedSchemaGroup, setSelectedSchemaGroup] = useState<string | null>(
    null
  );
  /** 焦点子图：邻域深度（跳数） */
  const [erNeighborhoodDepth, setErNeighborhoodDepth] = useState(1);
  /** 焦点子图：最多包含表数 */
  const [erMaxNodes, setErMaxNodes] = useState(48);
  /** 紧凑实体：省略列定义以减小 Mermaid 文本 */
  const [erCompact, setErCompact] = useState(false);
  const [erLightboxOpen, setErLightboxOpen] = useState(false);

  const tables = (dataModels?.tables ?? []) as DataModelTable[];
  const relationships = dataModels?.relationships ?? [];

  const schemaGroups = useMemo(() => {
    const set = new Set<string>();
    for (const t of tables) set.add(schemaGroupKey(t));
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [tables]);

  useEffect(() => {
    if (!schemaGroups.length) {
      setSelectedSchemaGroup(null);
      return;
    }
    setSelectedSchemaGroup((prev) =>
      prev != null && schemaGroups.includes(prev) ? prev : schemaGroups[0]!
    );
  }, [schemaGroups]);

  const tablesInSchema = useMemo(() => {
    if (!selectedSchemaGroup) return [];
    return tables.filter((t) => schemaGroupKey(t) === selectedSchemaGroup);
  }, [tables, selectedSchemaGroup]);

  const filteredRelationships = useMemo(
    () => filterRelationshipsForTables(tablesInSchema, relationships),
    [tablesInSchema, relationships]
  );

  const neighborTableKeys = useMemo(
    () =>
      collectNeighborTableKeys(
        selectedKey,
        tablesInSchema,
        filteredRelationships,
        { maxDepth: erNeighborhoodDepth, maxNodes: erMaxNodes }
      ),
    [
      selectedKey,
      tablesInSchema,
      filteredRelationships,
      erNeighborhoodDepth,
      erMaxNodes,
    ]
  );

  const tablesForEr = useMemo(() => {
    const byKey = new Map(
      tablesInSchema.map((t) => [tableKey(t), t] as const)
    );
    const out: DataModelTable[] = [];
    for (const k of neighborTableKeys) {
      const t = byKey.get(k);
      if (t) out.push(t);
    }
    return out;
  }, [tablesInSchema, neighborTableKeys]);

  const relationshipsForEr = useMemo(
    () => filterRelationshipsForTables(tablesForEr, filteredRelationships),
    [tablesForEr, filteredRelationships]
  );

  const mermaidDef = useMemo(
    () =>
      buildErMermaid(tablesForEr, relationshipsForEr, {
        compact: erCompact,
      }),
    [tablesForEr, relationshipsForEr, erCompact]
  );

  const erSubgraphTotal = tablesInSchema.length;
  const erSubgraphShown = tablesForEr.length;
  /** BFS 因 maxNodes 截断（库中表数大于上限且已取满） */
  const erSubgraphCapped =
    neighborTableKeys.length >= erMaxNodes &&
    erSubgraphTotal > erMaxNodes;

  const selectedTable = useMemo((): DataModelTable | null => {
    if (!selectedKey) return null;
    return tablesInSchema.find((t) => tableKey(t) === selectedKey) ?? null;
  }, [tablesInSchema, selectedKey]);

  useEffect(() => {
    const keys = tablesInSchema.map((t) => tableKey(t));
    if (!keys.length) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((prev) => (prev && keys.includes(prev) ? prev : keys[0]!));
  }, [tablesInSchema]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <DataModelAiPromptPanel />
        <LoadingSkeleton variant="card" lines={6} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <DataModelAiPromptPanel />
        <ErrorState
          title="无法加载数据模型"
          message={loadError}
          onRetry={() => void loadAll()}
        />
      </div>
    );
  }

  if (!dataModels || tables.length === 0) {
    return (
      <div className="space-y-4">
        <DataModelAiPromptPanel />
        <EmptyState
          title="暂无数据模型"
          description="请先在工作区执行 Observatory 扫描以生成 data-models.json（含表结构与关系），或使用上方提示词让 AI 生成该文件。"
          action={{ label: "重试加载", onClick: () => void loadAll() }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <DataModelAiPromptPanel />

        <Card
          title="数据模型 ER"
          subtitle={
            dataModels.generated_at
              ? `生成时间 ${dataModels.generated_at}`
              : "由 data-models.json 驱动"
          }
        >
          {dataModels.source_files && dataModels.source_files.length > 0 ? (
            <SourceFilesCollapsible files={dataModels.source_files} />
          ) : null}

          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              库 / schema
              <select
                value={selectedSchemaGroup ?? ""}
                onChange={(e) => setSelectedSchemaGroup(e.target.value || null)}
                className="min-w-[10rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {schemaGroups.map((g) => (
                  <option key={g} value={g}>
                    {g === "default" ? "默认 (public)" : g}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              表（焦点）
              <select
                value={selectedKey ?? ""}
                onChange={(e) => setSelectedKey(e.target.value || null)}
                className="min-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                {tablesInSchema.map((t) => {
                  const k = tableKey(t);
                  return (
                    <option key={k} value={k}>
                      {t.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              邻域深度
              <select
                value={erNeighborhoodDepth}
                onChange={(e) =>
                  setErNeighborhoodDepth(Number(e.target.value) || 1)
                }
                className="min-w-[6rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value={1}>1 跳</option>
                <option value={2}>2 跳</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
              最多表数
              <select
                value={erMaxNodes}
                onChange={(e) =>
                  setErMaxNodes(Number(e.target.value) || 48)
                }
                className="min-w-[6rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
                <option value={128}>128</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-0.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={erCompact}
                onChange={(e) => setErCompact(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              紧凑实体（省略列）
            </label>
          </div>

          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            以「表」为起点在推断关系上展开子图（非全库）。当前 ER 含{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-200">
              {erSubgraphShown}
            </span>{" "}
            / {erSubgraphTotal} 张表
            {erSubgraphCapped ? (
              <span className="text-amber-700 dark:text-amber-300">
                {" "}
                · 已受邻域深度或「最多表数」限制，可调高后重试
              </span>
            ) : null}
          </p>
          {mermaidDef.length > ER_MERMAID_WARN_CHARS ? (
            <div
              className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              role="status"
            >
              当前 ER 定义较长（{mermaidDef.length.toLocaleString()} 字符），渲染可能较慢或失败；建议开启「紧凑实体」或减小「最多表数」。
            </div>
          ) : null}

          <div className="relative min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/30">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                disabled={!mermaidDef.trim()}
                onClick={() => setErLightboxOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                title={mermaidDef.trim() ? "在新窗口区域放大查看 ER 图" : "暂无 ER 内容"}
              >
                <Maximize2 className="size-3.5 shrink-0" aria-hidden />
                放大查看
              </button>
            </div>
            <ERDiagram definition={mermaidDef} dark={dark} />
          </div>
        </Card>
      </div>

      <ERDiagramLightbox
        open={erLightboxOpen}
        onClose={() => setErLightboxOpen(false)}
        definition={mermaidDef}
        dark={dark}
      />

      <TableDetail
        table={selectedTable}
        relationships={filteredRelationships}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
