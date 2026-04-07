/**
 * 会话产物：files_touched + artifacts 时间线。
 * primary_doc: docs/SCHEMA_SPEC.md §十二-B
 */
import { FileEdit, Package } from "lucide-react";
import { formatDateTimeZhFull } from "@/lib/format-time";

type Artifact = {
  type?: string;
  path?: string;
  timestamp?: string;
};

type Props = {
  filesTouched: string[];
  artifacts: Artifact[];
};

export function SessionArtifacts({ filesTouched, artifacts }: Props) {
  const hasFiles = filesTouched.length > 0;
  const hasArt = artifacts.length > 0;
  if (!hasFiles && !hasArt) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无文件与产物记录</p>
    );
  }

  return (
    <div className="space-y-4">
      {hasFiles ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <FileEdit className="size-3.5" aria-hidden />
            涉及文件
          </h4>
          <ul className="space-y-1 text-xs font-mono text-zinc-700 dark:text-zinc-200">
            {filesTouched.map((p) => (
              <li
                key={p}
                className="rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasArt ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <Package className="size-3.5" aria-hidden />
            产物时间线
          </h4>
          <ul className="space-y-2">
            {artifacts.map((a, i) => (
              <li
                key={`${a.path}-${i}`}
                className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-[#32324a]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-violet-600 dark:text-violet-400">
                    {a.type ?? "artifact"}
                  </span>
                  {a.timestamp ? (
                    <span className="text-[10px] text-zinc-500">
                      {formatDateTimeZhFull(a.timestamp)}
                    </span>
                  ) : null}
                </div>
                {a.path ? (
                  <p className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-200">
                    {a.path}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
