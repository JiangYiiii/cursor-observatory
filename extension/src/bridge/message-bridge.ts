/**
 * Webview ↔ Extension postMessage bridge（完整协议在 Phase 3 接入）。
 * primary_doc: docs/EXTENSION_DESIGN.md §七
 */
import type { WebviewPanel } from "vscode";

/**
 * 占位：后续用 `WebviewPanel.webview.onDidReceiveMessage` 与 Extension 命令打通。
 */
export class MessageBridge {
  constructor(_panel: WebviewPanel) {}

  dispose(): void {}
}
