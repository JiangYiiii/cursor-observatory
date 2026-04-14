import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "@/components/docs/MermaidBlock";
import {
  resolveDocLink,
  stripHashForFetch,
} from "@/components/docs/resolve-doc-link";

type Props = {
  content: string;
  currentPath: string;
  onNavigate: (relativePath: string) => void;
};

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return Children.toArray(node).map(flattenText).join("");
}

function mermaidDefinitionFromPre(children: ReactNode): string | null {
  const only = Children.toArray(children);
  if (only.length !== 1 || !isValidElement(only[0])) return null;
  const props = only[0].props as { className?: string; children?: ReactNode };
  if (!props.className?.includes("language-mermaid")) return null;
  return flattenText(props.children).replace(/\n$/, "");
}

export function DocsMarkdownPreview({
  content,
  currentPath,
  onNavigate,
}: Props) {
  return (
    <div className="prose prose-sm prose-zinc max-w-none overflow-auto px-1 dark:prose-invert prose-pre:bg-zinc-950/40 prose-pre:text-zinc-100 dark:prose-pre:bg-zinc-950/70">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const def = mermaidDefinitionFromPre(children);
            if (def !== null) {
              return <MermaidBlock definition={def} />;
            }
            return <pre>{children}</pre>;
          },
          a: ({ href, children }) => {
            if (!href) return <a>{children}</a>;
            const resolved = resolveDocLink(currentPath, href);
            if (resolved === null) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            return (
              <button
                type="button"
                className="cursor-pointer text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                onClick={() => onNavigate(stripHashForFetch(resolved))}
              >
                {children}
              </button>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
