interface PlaceholderProps {
  title: string;
  description?: string;
}

export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 dark:border-zinc-600 dark:bg-[#2a2a3c]">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          占位视图 — 数据与组件将在后续阶段接入。
        </p>
      )}
    </div>
  );
}
