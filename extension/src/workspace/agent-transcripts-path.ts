/**
 * 解析 Cursor Agent 转录目录：用户配置、路径 slug、回退探测。
 * primary_doc: docs/EXTENSION_DESIGN.md §3.3
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import {
  cursorProjectSlugCandidatesFromWorkspaceRoot,
  cursorProjectSlugFromWorkspaceRoot,
} from "./cursor-project-slug";
import { findAgentTranscriptsAncestor } from "./agent-transcripts-ancestry";

export {
  cursorProjectSlugFromWorkspaceRoot,
  cursorProjectSlugCandidatesFromWorkspaceRoot,
} from "./cursor-project-slug";
export { findAgentTranscriptsAncestor } from "./agent-transcripts-ancestry";

/** 用于在 ~/.cursor/projects 下匹配文件夹：忽略 `_` / `-` 差异 */
function normalizePathTokenForMatch(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, "-");
}

function expandConfigPlaceholders(raw: string, workspaceRoot: string): string {
  return raw
    .replace(/\$\{workspaceFolder\}/g, workspaceRoot)
    .replace(/\$\{workspaceRoot\}/g, workspaceRoot)
    .trim();
}

/**
 * 读取设置 \`observatory.transcript.agentTranscriptsPath\`（可含 \`${workspaceFolder}\`）。
 */
export function resolveAgentTranscriptsDir(workspaceRoot: string): string | null {
  const home = os.homedir();
  const configured =
    vscode.workspace
      .getConfiguration()
      .get<string>("observatory.transcript.agentTranscriptsPath", "")
      ?.trim() ?? "";

  if (configured.length > 0) {
    const expanded = expandConfigPlaceholders(configured, workspaceRoot);
    const abs = path.isAbsolute(expanded)
      ? expanded
      : path.join(workspaceRoot, expanded);
    if (fs.existsSync(abs)) {
      const root = findAgentTranscriptsAncestor(abs);
      if (root) {
        return root;
      }
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        return abs;
      }
      return path.dirname(abs);
    }
  }

  const slugVariants = cursorProjectSlugCandidatesFromWorkspaceRoot(workspaceRoot);
  const candidates: string[] = [];
  for (const slug of slugVariants) {
    candidates.push(
      path.join(home, ".cursor", "projects", slug, "agent-transcripts"),
      path.join(home, ".cursor", "agent-transcripts", slug)
    );
  }
  candidates.push(
    path.join(
      home,
      ".cursor",
      "projects",
      path.basename(workspaceRoot).replace(/[^\w.-]+/g, "-"),
      "agent-transcripts"
    ),
    path.join(workspaceRoot, ".cursor", "agent-transcripts")
  );

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const projectsRoot = path.join(home, ".cursor", "projects");
  try {
    const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
    const baseNorm = normalizePathTokenForMatch(path.basename(workspaceRoot));
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folderNorm = normalizePathTokenForMatch(ent.name);
      if (!folderNorm.includes(baseNorm)) continue;
      const at = path.join(projectsRoot, ent.name, "agent-transcripts");
      if (fs.existsSync(at)) return at;
    }
  } catch {
    /* ignore */
  }

  return null;
}
