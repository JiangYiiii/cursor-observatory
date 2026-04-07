/**
 * Mermaid ER 图渲染（动态加载 mermaid，避免阻塞首屏）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.4
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  definition: string;
  dark: boolean;
};

export function ERDiagram({ definition, dark }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!definition.trim()) {
      el.innerHTML = "";
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    el.innerHTML =
      '<p class="text-xs text-zinc-500 dark:text-zinc-400">渲染中…</p>';

    void import("mermaid")
      .then(async (mod) => {
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "loose",
          er: { useMaxWidth: true },
          /** 默认 5e4 会触发「Maximum text size in diagram exceeded」；焦点子图下仍可能较大 */
          maxTextSize: 600_000,
          maxEdges: 2500,
        });
        const id = `er-${Math.random().toString(36).slice(2, 11)}`;
        try {
          const { svg } = await mermaid.render(id, definition);
          if (cancelled || !ref.current) return;
          ref.current.innerHTML = svg;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!cancelled) {
            setError(msg);
            if (ref.current) ref.current.innerHTML = "";
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [definition, dark]);

  return (
    <div className="space-y-2">
      {error ? (
        <div
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          <p className="font-medium">ER 图解析失败</p>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] opacity-90">
            {error}
          </pre>
        </div>
      ) : null}
      <div
        ref={ref}
        className="er-mermaid min-h-[200px] overflow-x-auto [&_svg]:max-w-none"
        aria-label="数据模型 ER 图"
      />
    </div>
  );
}
