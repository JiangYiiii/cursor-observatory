import { Copy } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  content: string;
};

export function DocsJsonPreview({ content }: Props) {
  const [copied, setCopied] = useState(false);

  const { display, parseError } = useMemo(() => {
    try {
      const obj = JSON.parse(content) as unknown;
      return {
        display: JSON.stringify(obj, null, 2),
        parseError: null as string | null,
      };
    } catch (e) {
      return {
        display: content,
        parseError: e instanceof Error ? e.message : String(e),
      };
    }
  }, [content]);

  const copy = () => {
    void navigator.clipboard?.writeText(display);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="not-prose space-y-2 px-1">
      {parseError ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          JSON 解析失败（已按原文显示）：{parseError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700"
          onClick={() => copy()}
        >
          <Copy className="size-3.5" />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-900 whitespace-pre dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-100">
        {display}
      </pre>
    </div>
  );
}
