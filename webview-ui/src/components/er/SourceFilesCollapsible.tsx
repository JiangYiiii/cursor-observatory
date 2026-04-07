import { useEffect, useRef, useState } from "react";

type Props = {
  files: string[];
};

/**
 * 来源路径较多时默认折叠为约两行高度，避免挤占 ER 区域。
 */
export function SourceFilesCollapsible({ files }: Props) {
  const [expanded, setExpanded] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const [canToggle, setCanToggle] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const check = () => {
      setCanToggle(el.scrollHeight > el.clientHeight + 1);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [files, expanded]);

  if (files.length === 0) return null;

  return (
    <div className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="text-zinc-500 dark:text-zinc-400">来源：</span>
      <div
        ref={innerRef}
        className={
          expanded
            ? "mt-1 flex flex-wrap gap-x-2 gap-y-1"
            : "mt-1 flex max-h-[2.75rem] flex-wrap gap-x-2 gap-y-1 overflow-hidden"
        }
      >
        {files.map((f) => (
          <code
            key={f}
            className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800"
          >
            {f}
          </code>
        ))}
      </div>
      {canToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-violet-600 hover:underline dark:text-violet-400"
        >
          {expanded ? "收起" : "展开"}
        </button>
      ) : null}
    </div>
  );
}
