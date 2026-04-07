/**
 * 按能力 ID 筛选时间线事件。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.5, §4.6
 */
import { Filter } from "lucide-react";
import type { Capability } from "@/types/observatory";

type Props = {
  capabilities: Capability[];
  value: string;
  onChange: (capabilityId: string) => void;
  className?: string;
};

export function CapabilityFilter({
  capabilities,
  value,
  onChange,
  className = "",
}: Props) {
  return (
    <label
      className={`flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 ${className}`}
    >
      <Filter className="size-4 shrink-0 text-zinc-400" aria-hidden />
      <span className="whitespace-nowrap">按能力筛选</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[12rem] max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="">全部能力</option>
        {capabilities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title ? `${c.title} (${c.id})` : c.id}
          </option>
        ))}
      </select>
    </label>
  );
}
