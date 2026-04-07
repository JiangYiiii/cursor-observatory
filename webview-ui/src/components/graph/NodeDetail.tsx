import { FileCode, Layers, Tag, X } from "lucide-react";
import type { ArchitectureModule } from "@/types/observatory";
import { Badge } from "@/components/common";

type Props = {
  module: ArchitectureModule | null;
  onClose: () => void;
};

export function NodeDetail({ module, onClose }: Props) {
  if (!module) {
    return (
      <aside className="w-full shrink-0 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400 lg:w-80">
        点击节点查看模块详情
      </aside>
    );
  }

  const stats = module.stats as
    | {
        total_lines?: number;
        total_functions?: number;
        total_classes?: number;
      }
    | undefined;
  const capIds = module.capability_ids as string[] | undefined;
  const files = module.files as
    | Array<{ path: string; lines?: number }>
    | undefined;

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#2a2a3c] lg:w-80">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {String(module.name ?? module.id)}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <Layers className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-mono">{module.path ?? module.id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="关闭详情"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[min(70vh,560px)] flex-1 overflow-y-auto p-3 text-sm">
        {stats ? (
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
              <dt className="text-zinc-500">行数</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.total_lines ?? "—"}
              </dd>
            </div>
            <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
              <dt className="text-zinc-500">函数</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.total_functions ?? "—"}
              </dd>
            </div>
            <div className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
              <dt className="text-zinc-500">类</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {stats.total_classes ?? "—"}
              </dd>
            </div>
          </dl>
        ) : null}

        {capIds && capIds.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <Tag className="size-3.5" aria-hidden />
              能力 ID
            </p>
            <div className="flex flex-wrap gap-1">
              {capIds.map((id) => (
                <Badge key={id} variant="neutral" className="font-mono text-[10px]">
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {files && files.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <FileCode className="size-3.5" aria-hidden />
              文件
            </p>
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              {files.slice(0, 12).map((f) => (
                <li key={f.path} className="truncate font-mono">
                  {f.path}
                  {typeof f.lines === "number" ? ` · ${f.lines}L` : ""}
                </li>
              ))}
              {files.length > 12 ? (
                <li className="text-zinc-400">… 共 {files.length} 个文件</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
