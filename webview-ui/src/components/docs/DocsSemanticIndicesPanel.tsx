import type { AiIndexSummaryItem } from "@/types/observatory";

type Props = {
  items: AiIndexSummaryItem[];
  truncated: boolean;
  onOpenDocPath: (relativePath: string) => void;
  onOpenIndexJson: (relativePath: string) => void;
};

export function DocsSemanticIndicesPanel({
  items,
  truncated,
  onOpenDocPath,
  onOpenIndexJson,
}: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        未发现语义索引 JSON（可通过设置{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
          observatory.docs.semanticIndexGlob
        </code>{" "}
        调整 glob）。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          列表已截断，请缩小 glob 或文档量。
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="py-1 pr-2">文件</th>
              <th className="py-1 pr-2">domain</th>
              <th className="py-1 pr-2">flow</th>
              <th className="py-1 pr-2">锚点数</th>
              <th className="py-1">关联文档</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.relativePath}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-1 pr-2 align-top">
                  <button
                    type="button"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => onOpenIndexJson(row.relativePath)}
                  >
                    {row.relativePath}
                  </button>
                </td>
                <td className="py-1 pr-2 align-top">{row.domain ?? "—"}</td>
                <td className="py-1 pr-2 align-top">{row.flow ?? "—"}</td>
                <td className="py-1 pr-2 align-top tabular-nums">
                  {row.anchorCount}
                </td>
                <td className="py-1 align-top">
                  {row.docLinks.length === 0 ? (
                    "—"
                  ) : (
                    <ul className="list-inside list-disc">
                      {row.docLinks.map((d) => (
                        <li key={d}>
                          <button
                            type="button"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => onOpenDocPath(d)}
                          >
                            {d}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
