/**
 * 将 `handleObservatoryBridgeMessage` 挂到 WebviewPanel（宿主页嵌入 React 时使用，非 iframe）。
 * primary_doc: docs/EXTENSION_DESIGN.md §七
 */
import * as vscode from "vscode";
import {
  handleObservatoryBridgeMessage,
  type GetObservatoryStore,
} from "../bridge/observatory-request-handler";

export function attachObservatoryWebviewBridge(
  webview: vscode.Webview,
  getStore: GetObservatoryStore
): vscode.Disposable {
  return webview.onDidReceiveMessage((msg: unknown) => {
    void (async () => {
      const reply = await handleObservatoryBridgeMessage(msg, getStore);
      if (reply) {
        await webview.postMessage(reply);
      }
    })();
  });
}
