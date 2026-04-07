/**
 * 数据源抽象 + 工厂。
 * primary_doc: docs/FRONTEND_DESIGN.md §二
 */
import { CursorBridgeDataSource } from "./cursor-bridge";
import { HttpDataSource } from "./http-client";
import { getWorkspaceRootFromLocation, inferHttpBaseUrl } from "./env";
import type { CreateDataSourceOptions, IDataSource } from "./idata-source";

export type { CreateDataSourceOptions, IDataSource } from "./idata-source";
export { ObservatoryDataError } from "./errors";

function resolveRoot(explicit?: string | null): string | null {
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return explicit;
  }
  return getWorkspaceRootFromLocation();
}

/**
 * 自动选择：VS Code Webview 宿主页（非 iframe）可用 `acquireVsCodeApi` 时走 Bridge；否则 HTTP。
 */
export function createDataSource(
  options?: CreateDataSourceOptions
): IDataSource {
  const workspaceRoot = resolveRoot(options?.workspaceRoot);
  const baseUrl = options?.baseUrl ?? inferHttpBaseUrl();

  const g = globalThis as unknown as {
    acquireVsCodeApi?: () => {
      postMessage: (msg: unknown) => void;
      getState: () => unknown;
      setState: (s: unknown) => void;
    };
  };

  if (typeof g.acquireVsCodeApi === "function") {
    return new CursorBridgeDataSource({ workspaceRoot });
  }

  return new HttpDataSource({ baseUrl, workspaceRoot });
}
