import { useMemo, useState } from "react";
import { useReleaseStore } from "@/store/release-store";
import type { ImageTag } from "@/types/observatory";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Loader2, RefreshCw } from "lucide-react";

/** 解析镜像时间用于排序：createdAt，其次 parsed.buildTime */
function tagSortTimeMs(t: ImageTag): number | null {
  if (t.createdAt?.trim()) {
    const ms = Date.parse(t.createdAt);
    if (!Number.isNaN(ms)) return ms;
  }
  if (t.parsed?.buildTime?.trim()) {
    const ms = Date.parse(t.parsed.buildTime);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

export function ImageSelectorBar() {
  const [tagSortMode, setTagSortMode] = useState<"dateDesc" | "dateAsc" | "tagDesc">("dateDesc");
  const images = useReleaseStore((s) => s.images);
  const selectedImage = useReleaseStore((s) => s.selectedImage);
  const setSelectedImage = useReleaseStore((s) => s.setSelectedImage);
  const manualRefreshImages = useReleaseStore((s) => s.manualRefreshImages);
  const loadingImages = useReleaseStore((s) => s.loading.images);
  const compatSummary = useReleaseStore((s) => s.compatSummary);
  const imageIndex = useReleaseStore((s) => s.imageIndex);
  const pipelines = useReleaseStore((s) => s.pipelines);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, { tag: string; ref: ImageTag; compatCount: number }>();
    for (const tags of Object.values(images)) {
      for (const t of tags) {
        if (tagMap.has(t.tag)) continue;
        let compatCount = 0;
        for (const p of pipelines) {
          const repoTags = imageIndex[p.repoName];
          if (repoTags?.includes(t.tag)) compatCount++;
        }
        tagMap.set(t.tag, { tag: t.tag, ref: t, compatCount });
      }
    }
    const list = [...tagMap.values()];
    list.sort((a, b) => {
      if (tagSortMode === "tagDesc") {
        return b.tag.localeCompare(a.tag);
      }
      const ta = tagSortTimeMs(a.ref);
      const tb = tagSortTimeMs(b.ref);
      if (ta !== null && tb !== null && ta !== tb) {
        return tagSortMode === "dateDesc" ? tb - ta : ta - tb;
      }
      if (ta !== null && tb === null) return -1;
      if (ta === null && tb !== null) return 1;
      return tagSortMode === "dateDesc"
        ? b.tag.localeCompare(a.tag)
        : a.tag.localeCompare(b.tag);
    });
    return list;
  }, [images, imageIndex, pipelines, tagSortMode]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <span className="shrink-0 font-medium">目标镜像:</span>
          <select
            value={selectedImage}
            onChange={(e) => setSelectedImage(e.target.value)}
            className="min-w-[320px] rounded border border-zinc-200 bg-white px-2 py-1.5 font-mono text-[11px] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="">-- 请选择镜像 --</option>
            {allTags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.compatCount}/{pipelines.length} 流水线)
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">镜像顺序:</span>
          <select
            value={tagSortMode}
            onChange={(e) => setTagSortMode(e.target.value as "dateDesc" | "dateAsc" | "tagDesc")}
            className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            title="无日期时按标签名作为次要排序"
          >
            <option value="dateDesc">日期 · 新→旧</option>
            <option value="dateAsc">日期 · 旧→新</option>
            <option value="tagDesc">标签名 Z→A</option>
          </select>
          {tagSortMode === "dateDesc" ? (
            <ArrowDownWideNarrow className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
          ) : tagSortMode === "dateAsc" ? (
            <ArrowUpWideNarrow className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void manualRefreshImages()}
          disabled={loadingImages}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {loadingImages ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          刷新镜像
        </button>
      </div>

      {selectedImage && (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          兼容性:{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            {compatSummary.deployable}/{compatSummary.total}
          </span>{" "}
          条流水线可部署此镜像
        </p>
      )}
    </div>
  );
}
