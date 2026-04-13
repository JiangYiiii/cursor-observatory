/**
 * 将 Webview/HTTP 传入的 workspace 路径与已注册 Store 的键对齐（符号链接、路径别名等）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ObservatoryStore } from "./store";

/** HTTP 仪表盘：用已注册根列表对齐 ?root= */
export function resolveRegisteredWorkspaceKey(
  getStore: (workspaceRoot: string) => ObservatoryStore | undefined,
  listRoots: string[],
  rootRaw: string
): string | undefined {
  const normalized = path.normalize(rootRaw);
  if (getStore(normalized)) return normalized;
  let reqReal: string;
  try {
    reqReal = fs.realpathSync.native(normalized);
  } catch {
    return undefined;
  }
  for (const r of listRoots) {
    const rn = path.normalize(r);
    try {
      if (fs.realpathSync.native(rn) === reqReal && getStore(rn)) return rn;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function resolveRegisteredStore(
  getStore: (workspaceRoot: string) => ObservatoryStore | undefined,
  rootRaw: string
): ObservatoryStore | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const listRoots = folders.map((f) => path.normalize(f.uri.fsPath));
  const key = resolveRegisteredWorkspaceKey(getStore, listRoots, rootRaw);
  return key ? getStore(key) : undefined;
}
