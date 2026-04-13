import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  resolveDocLink,
  stripHashForFetch,
} from "@/components/docs/resolve-doc-link";

type Props = {
  content: string;
  currentPath: string;
  onNavigate: (relativePath: string) => void;
};

export function DocsMarkdownPreview({
  content,
  currentPath,
  onNavigate,
}: Props) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none overflow-auto px-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
