import { type ReactNode, useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { DocsTreeNode } from "@/types/observatory";

type Props = {
  root: DocsTreeNode;
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
};

function DirNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  defaultOpen,
}: {
  node: DocsTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={toggle}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        ) : (
          <ChevronRight className="size-3 shrink-0 opacity-60" />
        )}
        {open ? (
          <FolderOpen className="size-3.5 shrink-0 text-yellow-500" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-yellow-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        node.children?.map((c) => (
          <TreeItem
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

function FileNode({
  node,
  depth,
  selected,
  onSelectFile,
}: {
  node: DocsTreeNode;
  depth: number;
  selected: boolean;
  onSelectFile: (relativePath: string) => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm ${
        selected
          ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-950/50 dark:text-blue-300"
          : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
      }`}
      style={{ paddingLeft: 8 + depth * 14 + 14 }}
      onClick={() => onSelectFile(node.relativePath)}
    >
      <FileText className="size-3.5 shrink-0 text-zinc-500" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function TreeItem({
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
          <TreeItem
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
    return (
      <FileNode
        node={node}
        depth={depth}
        selected={selectedPath === node.relativePath}
        onSelectFile={onSelectFile}
      />
    );
  }

  const hasSelectedChild = selectedPath
    ? isAncestor(node, selectedPath)
    : false;

  return (
    <DirNode
      node={node}
      depth={depth}
      selectedPath={selectedPath}
      onSelectFile={onSelectFile}
      defaultOpen={depth < 1 || hasSelectedChild}
    />
  );
}

function isAncestor(node: DocsTreeNode, path: string): boolean {
  if (node.type === "file") return node.relativePath === path;
  return node.children?.some((c) => isAncestor(c, path)) ?? false;
}

export function DocsTreeView({ root, selectedPath, onSelectFile }: Props) {
  return (
    <div className="overflow-y-auto">
      <TreeItem
        node={root}
        depth={0}
        selectedPath={selectedPath}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}
