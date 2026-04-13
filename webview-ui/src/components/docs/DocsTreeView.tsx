import type { ReactNode } from "react";
import type { DocsTreeNode } from "@/types/observatory";

type Props = {
  root: DocsTreeNode;
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
};

function TreeRows({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: DocsTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
}): ReactNode {
  if (node.name === "" && node.relativePath === "" && node.children) {
    return (
      <>
        {node.children.map((c) => (
          <TreeRows
            key={`${c.type}:${c.relativePath}:${c.name}`}
            node={c}
            depth={depth}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </>
    );
  }

  if (node.type === "file") {
    const active = selectedPath === node.relativePath;
    return (
      <button
        type="button"
        className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
          active
            ? "bg-zinc-200 font-medium dark:bg-zinc-700"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelectFile(node.relativePath)}
      >
        {node.name}
      </button>
    );
  }

  return (
    <div className="min-w-0">
      <div
        className="truncate px-2 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.name}
      </div>
      {node.children?.map((c) => (
        <TreeRows
          key={`${c.type}:${c.relativePath}:${c.name}`}
          node={c}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

export function DocsTreeView({ root, selectedPath, onSelectFile }: Props) {
  return (
    <div className="max-h-[min(70vh,520px)] overflow-y-auto rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <TreeRows
        node={root}
        depth={0}
        selectedPath={selectedPath}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}
