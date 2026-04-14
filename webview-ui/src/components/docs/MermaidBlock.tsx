/**
 * 文档预览中 fenced `mermaid` 代码块渲染（动态加载 mermaid）。
 */
import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/theme-store";

type Props = {
  definition: string;
};

export function MermaidBlock({ definition }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useThemeStore((s) => s.theme === "dark");

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
          maxTextSize: 600_000,
          maxEdges: 2500,
        });
        const id = `doc-mmd-${Math.random().toString(36).slice(2, 11)}`;
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
    <div className="my-4 not-prose">
      {error ? (
        <div
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          <p className="font-medium">Mermaid 渲染失败</p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] opacity-90">
            {error}
          </pre>
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-zinc-200 bg-zinc-100 p-2 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900/50">
            {definition}
          </pre>
        </div>
      ) : null}
      <div
        ref={ref}
        className="min-h-[80px] overflow-x-auto [&_svg]:max-w-none"
        aria-label="Mermaid 图"
      />
    </div>
  );
}
