import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  Info,
} from "lucide-react";
import {
  DocsJsonPreview,
  DocsMarkdownPreview,
  DocsMetadataPanel,
  DocsRelationGraph,
  DocsTreeView,
} from "@/components/docs";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import type {
  DocsAiIndicesPayload,
  DocsCatalogDocument,
  DocsCatalogEntry,
  DocsConfigPayload,
  DocsTreeNode,
  DocsTreePayload,
} from "@/types/observatory";

type RightTab = "preview" | "graph" | "info";

function findPreferredMd(root: DocsTreeNode): string | null {
  const files: string[] = [];
  const walk = (n: DocsTreeNode): void => {
    if (n.type === "file" && n.relativePath) files.push(n.relativePath);
    n.children?.forEach(walk);
  };
  walk(root);
  const pref = files.find(
    (p) => p === "index.md" || /(^|\/)index\.md$/.test(p)
  );
  return pref ?? files[0] ?? null;
}

function extractAllTags(catalog: DocsCatalogDocument | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of catalog?.entries ?? []) {
    for (const t of e.tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}

const TAG_COLORS = [
  { bg: "bg-blue-500/20", text: "text-blue-800 dark:text-blue-400", border: "border-blue-500/30", hover: "hover:bg-blue-500/40" },
  { bg: "bg-green-500/20", text: "text-green-800 dark:text-green-400", border: "border-green-500/30", hover: "hover:bg-green-500/40" },
  { bg: "bg-purple-500/20", text: "text-purple-800 dark:text-purple-400", border: "border-purple-500/30", hover: "hover:bg-purple-500/40" },
  { bg: "bg-orange-500/20", text: "text-orange-800 dark:text-orange-400", border: "border-orange-500/30", hover: "hover:bg-orange-500/40" },
  { bg: "bg-red-500/20", text: "text-red-800 dark:text-red-400", border: "border-red-500/30", hover: "hover:bg-red-500/40" },
  { bg: "bg-cyan-500/20", text: "text-cyan-800 dark:text-cyan-400", border: "border-cyan-500/30", hover: "hover:bg-cyan-500/40" },
  { bg: "bg-pink-500/20", text: "text-pink-800 dark:text-pink-400", border: "border-pink-500/30", hover: "hover:bg-pink-500/40" },
  { bg: "bg-yellow-500/20", text: "text-yellow-800 dark:text-yellow-400", border: "border-yellow-500/30", hover: "hover:bg-yellow-500/40" },
];

function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0x7fffffff;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export function DocsWorkspaceSection() {
  const activeWorkspaceRoot = useObservatoryStore((s) => s.activeWorkspaceRoot);
  const docsHealth = useObservatoryStore((s) => s.docsHealth);

  const [cfg, setCfg] = useState<DocsConfigPayload | null>(null);
  const [tree, setTree] = useState<DocsTreePayload | null>(null);
  const [catalog, setCatalog] = useState<DocsCatalogDocument | null>(null);
  const [indices, setIndices] = useState<DocsAiIndicesPayload | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [activeTab, setActiveTab] = useState<RightTab>("preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const loadFile = useCallback(async (relativePath: string) => {
    const ds = getDataSource();
    setPreviewErr(null);
    try {
      const f = await ds.getDocsFile(relativePath);
      setPreview(f.content);
      setSelectedPath(relativePath);
      setActiveTab("preview");
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reload = useCallback(() => {
    setLoadingMeta(true);
    setLoadErr(null);
    const ds = getDataSource();
    void (async () => {
      try {
        const [c, t, cat, idx] = await Promise.all([
          ds.getDocsConfig(),
          ds.getDocsTree(),
          ds.getDocsCatalog().catch(() => null),
          ds.getDocsAiIndices(),
        ]);
        setCfg(c);
        setTree(t);
        setCatalog(cat);
        setIndices(idx);
        const pref = t.docsRootExists ? findPreferredMd(t.root) : null;
        if (pref) {
          setSelectedPath(pref);
          try {
            const f = await ds.getDocsFile(pref);
            setPreview(f.content);
          } catch (e) {
            setPreviewErr(e instanceof Error ? e.message : String(e));
          }
        } else {
          setSelectedPath(null);
          setPreview(null);
        }
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  useEffect(() => {
    reload();
  }, [activeWorkspaceRoot, reload]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const allTags = useMemo(() => extractAllTags(catalog), [catalog]);

  const catalogEntryForSelected = useMemo<DocsCatalogEntry | null>(() => {
    if (!selectedPath || !catalog?.entries) return null;
    return catalog.entries.find((e) => e.path === selectedPath) ?? null;
  }, [selectedPath, catalog]);

  const filteredTreeFiles = useMemo(() => {
    if (!searchQuery && !activeTag) return null;
    const entries = catalog?.entries ?? [];
    const matched = new Set<string>();
    const ql = searchQuery.trim().toLowerCase();
    for (const e of entries) {
      const tagMatch = !activeTag || (e.tags ?? []).includes(activeTag);
      if (!tagMatch) continue;
      if (!ql) {
        matched.add(e.path);
        continue;
      }
      const hay = [e.title, e.summary, e.path, ...(e.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.includes(ql)) matched.add(e.path);
    }
    return matched;
  }, [searchQuery, activeTag, catalog]);

  const onSelectFile = (relativePath: string) => {
    void loadFile(relativePath);
  };

  const g = globalThis as unknown as { acquireVsCodeApi?: unknown };
  const canOpenEditor = typeof g.acquireVsCodeApi === "function";

  const lastSync = docsHealth?.generated_at
    ? new Date(docsHealth.generated_at).toLocaleString("zh-CN")
    : null;

  if (loadingMeta) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-600 dark:text-zinc-500">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        正在加载文档浏览…
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        文档浏览不可用：{loadErr}
      </div>
    );
  }

  const rightPanel = (
    <aside
      className={`flex min-w-0 flex-1 flex-col border-l border-zinc-200 bg-zinc-50 transition-all dark:border-zinc-700 dark:bg-[#1e1e2e] ${
        fullscreen
          ? "fixed inset-0 z-50 border-l-0"
          : ""
      }`}
    >
      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-100 px-2 dark:border-zinc-700 dark:bg-[#252536]">
        <div className="flex h-full">
          <TabButton
            active={activeTab === "preview"}
            icon={<FileText className="size-3.5" />}
            label="实时预览"
            onClick={() => setActiveTab("preview")}
          />
          <TabButton
            active={activeTab === "graph"}
            icon={<Network className="size-3.5" />}
            label="关系图谱"
            onClick={() => setActiveTab("graph")}
          />
          <TabButton
            active={activeTab === "info"}
            icon={<Info className="size-3.5" />}
            label="元数据"
            onClick={() => setActiveTab("info")}
          />
        </div>
        <button
          type="button"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700/80"
          title={fullscreen ? "退出全屏" : "全屏查看"}
          onClick={() => setFullscreen((f) => !f)}
        >
          {fullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </button>
      </div>

      {/* Panel content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "preview" && (
          <div
            className={`h-full overflow-y-auto p-6 ${
              fullscreen ? "mx-auto max-w-[900px]" : ""
            }`}
          >
            {previewErr ? (
              <p className="text-sm text-red-600 dark:text-red-400">{previewErr}</p>
            ) : selectedPath && preview != null ? (
              selectedPath.toLowerCase().endsWith(".json") ? (
                <DocsJsonPreview content={preview} />
              ) : (
                <DocsMarkdownPreview
                  content={preview}
                  currentPath={selectedPath}
                  onNavigate={(p) => void loadFile(p)}
                />
              )
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-500">
                请从左侧选择 Markdown 文件；若存在 index.md 将默认打开。
              </p>
            )}
          </div>
        )}
        {activeTab === "graph" && tree && (
          <DocsRelationGraph
            tree={tree.root}
            currentFile={selectedPath}
            markdownContent={preview}
            onSelectFile={onSelectFile}
          />
        )}
        {activeTab === "info" && (
          <div
            className={`h-full overflow-y-auto ${
              fullscreen ? "mx-auto max-w-[900px] p-10" : ""
            }`}
          >
            <DocsMetadataPanel
              selectedPath={selectedPath}
              catalogEntry={catalogEntryForSelected}
              canOpenEditor={canOpenEditor}
              onOpenInEditor={() => {
                if (selectedPath) {
                  void getDataSource().openWorkspaceFile(selectedPath);
                }
              }}
              onCopyPath={() => {
                if (selectedPath) {
                  void navigator.clipboard?.writeText(selectedPath);
                }
              }}
            />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top toolbar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-700 dark:bg-[#252536]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            文档管理器
          </span>
          {cfg && (
            <>
              <span className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
              <span className="text-[11px] text-zinc-600 dark:text-zinc-500">
                根：<code className="font-mono">{cfg.docsRoot}</code>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-[10px] text-zinc-500">
              最后同步: {lastSync}
            </span>
          )}
          <button
            type="button"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700/80"
            title="刷新"
            onClick={reload}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Warning banners */}
      {tree && !tree.docsRootExists && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          配置的文档根目录不存在。请检查{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-zinc-800">
            observatory.docs.root
          </code>
          。
        </div>
      )}

      {/* Main content: sidebar + right panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-700 dark:bg-[#252536]">
          {/* Search */}
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="search"
                placeholder="搜索文档…"
                className="w-full rounded border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-[#1e1e2e] dark:text-zinc-200 dark:placeholder:text-zinc-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between p-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              <span>工作区目录</span>
            </div>
            {tree ? (
              <DocsTreeView
                root={
                  filteredTreeFiles
                    ? filterTree(tree.root, filteredTreeFiles)
                    : tree.root
                }
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ) : null}
            {tree?.truncated && (
              <p className="px-3 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                目录树已截断（文件数过多）
              </p>
            )}
          </div>

          {/* Tag filter */}
          {allTags.size > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-700">
              <div className="p-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                标签筛选
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {activeTag && (
                  <button
                    type="button"
                    className="rounded-full border border-zinc-400/40 bg-zinc-200/80 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-300/80 dark:border-zinc-500/30 dark:bg-zinc-500/20 dark:text-zinc-400 dark:hover:bg-zinc-500/40"
                    onClick={() => setActiveTag(null)}
                  >
                    清除
                  </button>
                )}
                {[...allTags.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([tag, count]) => {
                    const c = tagColor(tag);
                    const isActive = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                          isActive
                            ? `${c.bg} ${c.text} ${c.border} ring-1 ring-current`
                            : `${c.bg} ${c.text} ${c.border} ${c.hover}`
                        }`}
                        onClick={() =>
                          setActiveTag(isActive ? null : tag)
                        }
                      >
                        #{tag} ({count})
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Semantic indices summary in sidebar */}
          {indices && indices.items.length > 0 && (
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                语义索引
              </div>
              <div className="space-y-1 text-[11px]">
                {indices.items.slice(0, 5).map((item) => (
                  <button
                    key={item.relativePath}
                    type="button"
                    className="block w-full truncate text-left text-blue-700 hover:underline dark:text-blue-400"
                    onClick={() => onSelectFile(item.relativePath)}
                  >
                    {item.domain ?? "—"}/{item.flow ?? "—"}{" "}
                    <span className="text-zinc-500">({item.anchorCount})</span>
                  </button>
                ))}
                {indices.items.length > 5 && (
                  <span className="text-zinc-500">
                    +{indices.items.length - 5} 更多
                  </span>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Right panel */}
        {rightPanel}
      </div>

      {/* Bottom status bar */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-[#252536] dark:text-zinc-500">
        <div className="flex items-center gap-4">
          {selectedPath && (
            <span className="truncate">{selectedPath}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>Markdown</span>
          {tree && (
            <span>
              {countFiles(tree.root)} 篇文档
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-full items-center gap-1.5 px-4 text-xs transition-colors ${
        active
          ? "border-t-2 border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-100"
          : "text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function filterTree(
  node: DocsTreeNode,
  matchedPaths: Set<string>
): DocsTreeNode {
  if (node.type === "file") {
    return node;
  }
  const children =
    node.children
      ?.map((c) => {
        if (c.type === "file") {
          return matchedPaths.has(c.relativePath) ? c : null;
        }
        const filtered = filterTree(c, matchedPaths);
        if (!filtered.children || filtered.children.length === 0) return null;
        return filtered;
      })
      .filter((c): c is DocsTreeNode => c !== null) ?? [];
  return { ...node, children };
}

function countFiles(node: DocsTreeNode): number {
  if (node.type === "file") return 1;
  return node.children?.reduce((s, c) => s + countFiles(c), 0) ?? 0;
}
