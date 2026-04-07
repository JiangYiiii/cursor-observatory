/**
 * 从「已存在」的路径向上查找名为 `agent-transcripts` 的目录（无 vscode 依赖，便于单测）。
 * Cursor 常见布局：`.../agent-transcripts/<sessionId>/<sessionId>.jsonl`。
 */
import * as fs from "node:fs";
import * as path from "node:path";

export function findAgentTranscriptsAncestor(anyExistingPath: string): string | null {
  try {
    let current = path.resolve(anyExistingPath);
    if (!fs.existsSync(current)) {
      return null;
    }
    const st = fs.statSync(current);
    if (st.isFile()) {
      current = path.dirname(current);
    }
    while (true) {
      if (path.basename(current) === "agent-transcripts") {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  } catch {
    return null;
  }
  return null;
}
