/**
 * MCP 预检（纯函数，无 vscode 依赖，便于单测）
 */
export type McpStatus =
  | "configured"
  | "service_missing"
  | "tool_missing"
  | "malformed";

export interface McpStatusEntry {
  status: McpStatus;
  service?: string;
  tool?: string;
}

export function resolveMcpStatusFromStrings(
  service: string | undefined,
  tool: string | undefined
): McpStatusEntry {
  const s = service?.trim() ?? "";
  const t = tool?.trim() ?? "";
  if (!s) return { status: "service_missing" };
  if (!t) return { status: "tool_missing" };
  return { status: "configured", service: s, tool: t };
}
