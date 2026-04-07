/**
 * 多根工作区：在已注册的本地项目间切换（依赖 Extension 暴露的 workspace-roots API）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.2
 */
import { FolderGit2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchRegisteredWorkspaceRoots } from "@/services/env";
import { useObservatoryStore } from "@/store/observatory-store";

function pathBasename(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function ProjectSwitcher() {
  const activeWorkspaceRoot = useObservatoryStore((s) => s.activeWorkspaceRoot);
  const switchWorkspace = useObservatoryStore((s) => s.switchWorkspace);
  const [roots, setRoots] = useState<string[]>([]);

  useEffect(() => {
    void fetchRegisteredWorkspaceRoots().then(setRoots);
  }, []);

  const options = useMemo(() => {
    const merged = new Set(roots);
    if (activeWorkspaceRoot) merged.add(activeWorkspaceRoot);
    return [...merged].sort();
  }, [roots, activeWorkspaceRoot]);

  if (options.length === 0) {
    return null;
  }

  return (
    <label className="flex min-w-0 max-w-[min(100%,28rem)] items-center gap-2 text-sm">
      <FolderGit2
        className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
        aria-hidden
      />
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">项目</span>
      <select
        className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        value={activeWorkspaceRoot}
        title={activeWorkspaceRoot}
        onChange={(e) => void switchWorkspace(e.target.value)}
      >
        {options.map((r) => (
          <option key={r} value={r} title={r}>
            {pathBasename(r)}
          </option>
        ))}
      </select>
    </label>
  );
}
