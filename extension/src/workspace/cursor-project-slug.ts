/**
 * Cursor ~/.cursor/projects/<slug>/ 目录名与本地工作区绝对路径的对应关系。
 * primary_doc: docs/EXTENSION_DESIGN.md §3.3
 */
import * as path from "node:path";

/**
 * 绝对路径去掉前导 `/`，再把 `/` 换成 `-`。
 * 例：/Users/x/p/stock-dashboard → Users-x-p-stock-dashboard
 */
export function cursorProjectSlugFromWorkspaceRoot(workspaceRoot: string): string {
  const norm = path.resolve(workspaceRoot).replace(/\\/g, "/");
  const trimmed = norm.replace(/^\/+/, "");
  return trimmed.replace(/\//g, "-");
}

/**
 * Cursor `~/.cursor/projects/<slug>/` 可能将路径段中的 `_` 规范为 `-`（与本地文件夹名不一致时）。
 * 探测转录目录时应同时尝试 primary slug 与「下划线→连字符」变体。
 */
export function cursorProjectSlugCandidatesFromWorkspaceRoot(
  workspaceRoot: string
): string[] {
  const primary = cursorProjectSlugFromWorkspaceRoot(workspaceRoot);
  const hyphen = primary.replace(/_/g, "-");
  return hyphen === primary ? [primary] : [primary, hyphen];
}
