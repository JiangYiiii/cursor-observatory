import { Copy, ExternalLink } from "lucide-react";
import type { DocsCatalogEntry } from "@/types/observatory";

type Props = {
  selectedPath: string | null;
  catalogEntry: DocsCatalogEntry | null;
  canOpenEditor: boolean;
  onOpenInEditor: () => void;
  onCopyPath: () => void;
};

export function DocsMetadataPanel({
  selectedPath,
  catalogEntry,
  canOpenEditor,
  onOpenInEditor,
  onCopyPath,
}: Props) {
  if (!selectedPath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        选择一个文档查看元数据
      </div>
    );
  }

  const fileName = selectedPath.includes("/")
    ? selectedPath.split("/").pop()!
    : selectedPath;
  const dirPath = selectedPath.includes("/")
    ? selectedPath.slice(0, selectedPath.lastIndexOf("/"))
    : "/";

  const docKind = catalogEntry?.doc_kind;

  return (
    <div className="space-y-6 p-4">
      {/* Basic info */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
          基础信息
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <MetaTableRow label="文件名" value={fileName} />
              <MetaTableRow label="路径" value={dirPath} />
              {catalogEntry?.title ? (
                <MetaTableRow label="标题" value={catalogEntry.title} />
              ) : null}
              {catalogEntry?.summary ? (
                <MetaTableRow label="摘要" value={catalogEntry.summary} />
              ) : null}
              {docKind ? <MetaTableRow label="类型" value={docKind} /> : null}
              {catalogEntry?.category_id ? (
                <MetaTableRow label="分类" value={catalogEntry.category_id} />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
          快捷操作
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded border border-zinc-300 bg-white p-2 text-xs text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700"
            onClick={onCopyPath}
          >
            <Copy className="size-3.5" />
            <span>复制路径</span>
          </button>
          {canOpenEditor && (
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded border border-zinc-300 bg-white p-2 text-xs text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700"
              onClick={onOpenInEditor}
            >
              <ExternalLink className="size-3.5" />
              <span>编辑器打开</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaTableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th
        scope="row"
        className="w-[28%] shrink-0 border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-xs font-medium text-zinc-500 align-top dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
      >
        {label}
      </th>
      <td className="border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 break-words whitespace-pre-wrap align-top dark:border-zinc-700 dark:text-zinc-200">
        {value}
      </td>
    </tr>
  );
}
