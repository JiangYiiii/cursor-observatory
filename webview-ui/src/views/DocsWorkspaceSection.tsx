import { useCallback, useEffect, useState } from "react";
import {
  DocsCatalogPanel,
  DocsMarkdownPreview,
  DocsSemanticIndicesPanel,
  DocsTreeView,
} from "@/components/docs";
import { getDataSource } from "@/services/data-source-instance";
import { useObservatoryStore } from "@/store/observatory-store";
import type {
  DocsAiIndicesPayload,
  DocsCatalogDocument,
  DocsConfigPayload,
  DocsTreeNode,
  DocsTreePayload,
} from "@/types/observatory";

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

export function DocsWorkspaceSection() {
  const activeWorkspaceRoot = useObservatoryStore((s) => s.activeWorkspaceRoot);

  const [cfg, setCfg] = useState<DocsConfigPayload | null>(null);
  const [tree, setTree] = useState<DocsTreePayload | null>(null);
  const [catalog, setCatalog] = useState<DocsCatalogDocument | null>(null);
  const [indices, setIndices] = useState<DocsAiIndicesPayload | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const loadFile = useCallback(async (relativePath: string) => {
    const ds = getDataSource();
    setPreviewErr(null);
    try {
      const f = await ds.getDocsFile(relativePath);
      setPreview(f.content);
      setSelectedPath(relativePath);
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancel = false;
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
        if (cancel) return;
        setCfg(c);
        setTree(t);
        setCatalog(cat);
        setIndices(idx);
        const pref = t.docsRootExists ? findPreferredMd(t.root) : null;
        if (pref) {
          setSelectedPath(pref);
          try {
            const f = await ds.getDocsFile(pref);
            if (!cancel) setPreview(f.content);
          } catch (e) {
            if (!cancel) {
              setPreviewErr(e instanceof Error ? e.message : String(e));
            }
          }
        } else {
          setSelectedPath(null);
          setPreview(null);
        }
      } catch (e) {
        if (!cancel) {
          setLoadErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancel) setLoadingMeta(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeWorkspaceRoot]);

  const onSelectFile = (relativePath: string) => {
    void loadFile(relativePath);
  };

  const g = globalThis as unknown as { acquireVsCodeApi?: unknown };
  const canOpenEditor = typeof g.acquireVsCodeApi === "function";

  const onCopyPromptHint = () => {
    void navigator.clipboard?.writeText(
      "在 Cursor 中执行命令「Observatory」相关模板加载，或请求扩展使用 getPromptTemplate(\"docs-catalog\") 获取 docs-catalog.md，将输出保存为 docs/00-meta/docs-catalog.json（相对你的 docs 根）。"
    );
  };

  if (loadingMeta) {
    return (
      <div className="rounded border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-700">
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

  return (
    <div className="space-y-6">
      {cfg ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          文档根：<code className="font-mono">{cfg.docsRoot}</code> · 索引：{" "}
          <code className="font-mono">{cfg.aiDocIndexRelativePath}</code> · 语义
          glob：<code className="font-mono">{cfg.semanticIndexGlob}</code>
        </div>
      ) : null}

      {tree && !tree.docsRootExists ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          配置的文档根目录不存在。请在设置中检查{" "}
          <code className="rounded bg-white px-1 dark:bg-zinc-800">
            observatory.docs.root
          </code>
          或创建对应目录。
        </div>
      ) : null}

      <div className="grid min-h-[320px] gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            目录
          </h3>
          {tree ? (
            <DocsTreeView
              root={tree.root}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ) : null}
          {tree?.truncated ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              目录树已截断（文件数过多）；请缩小文档库或使用搜索。
            </p>
          ) : null}
        </div>
        <div className="min-h-0 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              预览
            </h3>
            {selectedPath && canOpenEditor ? (
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                onClick={() => void getDataSource().openWorkspaceFile(selectedPath)}
              >
                在编辑器中打开
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,520px)] overflow-y-auto rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
            {previewErr ? (
              <p className="text-sm text-red-600">{previewErr}</p>
            ) : selectedPath && preview != null ? (
              <DocsMarkdownPreview
                content={preview}
                currentPath={selectedPath}
                onNavigate={(p) => void loadFile(p)}
              />
            ) : (
              <p className="text-sm text-zinc-500">
                请从左侧选择 Markdown 文件；若存在 index.md 将默认打开。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          文档目录（catalog）
        </h3>
        <DocsCatalogPanel
          catalog={catalog}
          onOpenPath={(p) => void loadFile(p)}
          onCopyPromptHint={onCopyPromptHint}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          语义索引
        </h3>
        {indices ? (
          <DocsSemanticIndicesPanel
            items={indices.items}
            truncated={indices.truncated}
            onOpenDocPath={(p) => void loadFile(p)}
            onOpenIndexJson={(p) => void loadFile(p)}
          />
        ) : null}
      </div>
    </div>
  );
}
