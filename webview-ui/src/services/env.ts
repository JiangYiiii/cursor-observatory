/**
 * 运行环境：工作区根路径、API 基址（HTTP / Vite 代理）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.2
 */

/** 从当前页 URL 读取 `?root=`（Extension 打开 Dashboard 时附带）。 */
export function getWorkspaceRootFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const raw = q.get("root");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * HTTP API 基址。
 * - 生产：与静态页同域（Extension 在 :3800 提供）。
 * - 开发：`import.meta.env.DEV` 时用相对路径走 Vite `server.proxy`。
 */
export function inferHttpBaseUrl(): string {
  if (import.meta.env.DEV) {
    return "";
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://127.0.0.1:3800";
}

/** 多根工作区：从本地 Observatory 服务拉取已注册路径（无服务或失败时返回 []） */
export async function fetchRegisteredWorkspaceRoots(): Promise<string[]> {
  const base = inferHttpBaseUrl();
  const url = `${base}/api/observatory/workspace-roots`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { roots?: string[] };
    return Array.isArray(data.roots) ? data.roots : [];
  } catch {
    return [];
  }
}
