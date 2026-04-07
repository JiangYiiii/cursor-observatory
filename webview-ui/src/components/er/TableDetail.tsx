/**
 * 选中数据表的字段、索引、外键与关联能力。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.4, docs/SCHEMA_SPEC.md §十
 */
import { Box, Database, Key, Link2, Tag, X } from "lucide-react";
import { Badge } from "@/components/common";
import { tableKey } from "@/lib/er-mermaid";
import type {
  DataModelRelationship,
  DataModelTable,
} from "@/types/observatory";

type Props = {
  table: DataModelTable | null;
  relationships: DataModelRelationship[];
  onClose: () => void;
};

export function TableDetail({ table, relationships, onClose }: Props) {
  if (!table) {
    return (
      <aside className="w-full shrink-0 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400 lg:w-96">
        点击左侧表名查看字段与索引
      </aside>
    );
  }

  const tk = tableKey(table);
  const relForTable = relationships.filter(
    (r) =>
      r.from_table === table.name ||
      r.to_table === table.name ||
      r.from_table === tk ||
      r.to_table === tk
  );

  const caps = table.capability_ids ?? [];

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#2a2a3c] lg:w-96">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-700">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <Database className="size-4 shrink-0 text-zinc-500" aria-hidden />
            <span className="truncate font-mono">{table.name}</span>
          </h3>
          {table.schema ? (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              schema: {table.schema}
            </p>
          ) : null}
          {table.description ? (
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              {String(table.description)}
            </p>
          ) : null}
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

      <div className="max-h-[min(70vh,640px)] flex-1 overflow-y-auto p-3 text-sm">
        {caps.length > 0 ? (
          <div className="mb-4">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <Tag className="size-3.5" aria-hidden />
              关联能力
            </p>
            <div className="flex flex-wrap gap-1">
              {caps.map((id) => (
                <Badge key={id} variant="neutral" className="font-mono text-[10px]">
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <Key className="size-3.5" aria-hidden />
          字段
        </div>
        {table.columns && table.columns.length > 0 ? (
          <div className="overflow-x-auto rounded border border-zinc-100 dark:border-zinc-700">
            <table className="w-full min-w-[280px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <th className="px-2 py-1.5 font-medium">列</th>
                  <th className="px-2 py-1.5 font-medium">类型</th>
                  <th className="px-2 py-1.5 font-medium">可空</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((c) => (
                  <tr
                    key={c.name}
                    className="border-b border-zinc-50 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-2 py-1 font-mono text-zinc-900 dark:text-zinc-100">
                      {c.name}
                      {c.primary_key ? (
                        <span className="ml-1 text-[10px] text-violet-600 dark:text-violet-400">
                          PK
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1 font-mono text-zinc-600 dark:text-zinc-400">
                      {c.type ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-zinc-500">
                      {c.nullable === false ? "否" : "是"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">无列定义</p>
        )}

        {table.indexes && table.indexes.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <Box className="size-3.5" aria-hidden />
              索引
            </p>
            <ul className="space-y-1.5 text-xs">
              {table.indexes.map((ix) => (
                <li
                  key={ix.name}
                  className="rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <span className="font-mono font-medium">{ix.name}</span>
                  {ix.unique ? (
                    <Badge variant="warning" className="ml-2 text-[10px]">
                      UNIQUE
                    </Badge>
                  ) : null}
                  <div className="mt-0.5 text-zinc-500">
                    ({ix.columns.join(", ")})
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {table.foreign_keys && table.foreign_keys.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              外键（表内声明）
            </p>
            <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {table.foreign_keys.map((fk, i) => (
                <li key={fk.name ?? i} className="font-mono">
                  {(fk.columns ?? []).join(", ")} →{" "}
                  {fk.referenced_table ?? "?"} (
                  {(fk.referenced_columns ?? []).join(", ")})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {relForTable.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <Link2 className="size-3.5" aria-hidden />
              关系（data-models）
            </p>
            <ul className="space-y-1.5 text-xs">
              {relForTable.map((r, i) => (
                <li
                  key={`${r.from_table}-${r.from_column}-${r.to_table}-${i}`}
                  className="rounded border border-zinc-100 px-2 py-1 dark:border-zinc-700"
                >
                  <span className="font-mono text-zinc-700 dark:text-zinc-200">
                    {r.from_table}.{r.from_column}
                  </span>
                  <span className="mx-1 text-zinc-400">→</span>
                  <span className="font-mono text-zinc-700 dark:text-zinc-200">
                    {r.to_table}.{r.to_column}
                  </span>
                  {r.type ? (
                    <Badge variant="neutral" className="ml-2 text-[10px]">
                      {r.type}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
