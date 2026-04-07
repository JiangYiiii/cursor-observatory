/**
 * Embeds browser dashboard (localhost) in a WebviewPanel via iframe.
 * primary_doc: docs/EXTENSION_DESIGN.md §七
 */
import * as vscode from "vscode";

export function openObservatoryDashboardPanel(
  port: number,
  workspaceRoot: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "observatoryDashboard",
    "Observatory",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );
  const rootQ = encodeURIComponent(workspaceRoot);
  const url = `http://127.0.0.1:${port}/?root=${rootQ}`;
  const cspPort = String(port);
  panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:${cspPort} http://localhost:${cspPort}; style-src 'unsafe-inline';">
</head>
<body style="margin:0;padding:0;height:100vh;background:var(--vscode-editor-background);">
  <iframe src="${url}" style="width:100%;height:100%;border:none" title="Observatory Dashboard"></iframe>
</body>
</html>`;
}
