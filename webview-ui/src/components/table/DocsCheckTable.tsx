/**
 * 文档健康检查项明细表（可展开 details）。
 * primary_doc: docs/SCHEMA_SPEC.md §十一, docs/FRONTEND_DESIGN.md §4.8
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { DocsHealthCheck } from "@/types/observatory";

type Props = {
  checks: DocsHealthCheck[];
};

export function DocsCheckTable({ checks }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  if (checks.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无检查项</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
            <th className="w-8 px-2 py-2" aria-hidden />
            <th className="px-2 py-2 font-medium">检查项</th>
            <th className="px-2 py-2 font-medium">说明</th>
            <th className="w-20 px-2 py-2 font-medium">得分</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const key = c.check;
            const expanded = open === key;
            const score = c.score;
            return (
              <Fragment key={key}>
                <tr
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
                  onClick={() => setOpen(expanded ? null : key)}
                >
                  <td className="px-2 py-2 align-top">
                    {expanded ? (
                      <ChevronDown className="size-4 text-zinc-400" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 text-zinc-400" aria-hidden />
                    )}
                  </td>
                  <td className="px-2 py-2 align-top font-mono text-[11px] font-medium text-zinc-900 dark:text-zinc-50">
                    {c.check}
                  </td>
                  <td className="px-2 py-2 align-top text-zinc-600 dark:text-zinc-300">
                    {c.description ?? "—"}
                  </td>
                  <td className="px-2 py-2 align-top tabular-nums">
                    {score != null ? (
                      <span
                        className={
                          score >= 80
                            ? "text-emerald-600 dark:text-emerald-400"
                            : score >= 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }
                      >
                        {score}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                {expanded && c.details ? (
                  <tr className="bg-zinc-50/80 dark:bg-zinc-900/50">
                    <td colSpan={4} className="px-3 py-2">
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-700 dark:text-zinc-200">
                        {JSON.stringify(c.details, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
