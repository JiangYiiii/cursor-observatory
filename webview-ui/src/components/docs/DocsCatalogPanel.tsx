import { useMemo, useState } from "react";
import type { DocsCatalogDocument } from "@/types/observatory";

type Props = {
  catalog: DocsCatalogDocument | null;
  onOpenPath: (relativePath: string) => void;
  onCopyPromptHint: () => void;
};

export function DocsCatalogPanel({
  catalog,
  onOpenPath,
  onCopyPromptHint,
}: Props) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | "all">("all");

  const entries = catalog?.entries ?? [];
  const taxonomy = catalog?.taxonomy ?? [];

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && e.category_id !== category) return false;
      if (!ql) return true;
      const hay = [
        e.title,
        e.summary,
        e.path,
        ...(e.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(ql);
    });
  }, [entries, q, category]);

  if (!catalog) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
        <p className="mb-2 font-medium">尚未生成 docs-catalog.json</p>
        <p className="mb-3">
          可在仓库{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            {"{docsRoot}/00-meta/docs-catalog.json"}
          </code>{" "}
          放置由 AI 生成的目录；或使用扩展命令加载{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            docs-catalog
          </code>{" "}
          提示词模板后粘贴结果保存。
        </p>
        <button
          type="button"
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={onCopyPromptHint}
        >
          查看提示词阶段说明
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="搜索标题、摘要、路径、标签…"
          className="min-w-[200px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              category === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
            onClick={() => setCategory("all")}
          >
            全部
          </button>
          {taxonomy.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded px-2 py-1 text-xs ${
                category === t.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
              onClick={() => setCategory(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {filtered.length === 0 ? (
          <li className="text-zinc-500">无匹配条目</li>
        ) : (
          filtered.map((e, i) => (
            <li key={`${e.path}-${i}`}>
              <button
                type="button"
                className="text-left text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => onOpenPath(e.path)}
              >
                <span className="font-medium">{e.title ?? e.path}</span>
                {e.summary ? (
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                    {e.summary}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
