/**
 * 文档根与 ai-doc-index 路径：与 package.json observatory.docs.* 对齐。
 */
import * as path from "node:path";
import * as vscode from "vscode";

const DEFAULT_DOCS_ROOT = "docs";
const DEFAULT_AI_INDEX_REL = "00-meta/ai-doc-index.json";
const DEFAULT_SEMANTIC_GLOB = "**/meta/ai-index*.json";

export type ObservatoryDocsSettings = {
  docsRoot: string;
  aiDocIndexRelativePath: string;
  semanticIndexGlob: string;
};

/** 禁止 workspace 外的绝对路径与 `..` 穿越 */
function sanitizeDocsRootSegment(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed) return DEFAULT_DOCS_ROOT;
  if (path.isAbsolute(trimmed)) return DEFAULT_DOCS_ROOT;
  const n = trimmed.replace(/^\/+/, "");
  if (n.includes("..") || n.startsWith("/")) return DEFAULT_DOCS_ROOT;
  return n;
}

function sanitizeAiIndexRelative(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed) return DEFAULT_AI_INDEX_REL;
  if (path.isAbsolute(trimmed)) return DEFAULT_AI_INDEX_REL;
  const n = trimmed.replace(/^\/+/, "");
  if (n.includes("..")) return DEFAULT_AI_INDEX_REL;
  return n;
}

function sanitizeSemanticGlob(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_SEMANTIC_GLOB;
  if (path.isAbsolute(trimmed)) return DEFAULT_SEMANTIC_GLOB;
  if (trimmed.includes("..")) return DEFAULT_SEMANTIC_GLOB;
  return trimmed;
}

export function getObservatoryDocsSettings(workspaceRoot: string): ObservatoryDocsSettings {
  const uri = vscode.Uri.file(workspaceRoot);
  const cfg = vscode.workspace.getConfiguration("observatory", uri);
  const docsRoot = sanitizeDocsRootSegment(
    cfg.get<string>("docs.root", DEFAULT_DOCS_ROOT) ?? DEFAULT_DOCS_ROOT
  );
  const aiDocIndexRelativePath = sanitizeAiIndexRelative(
    cfg.get<string>("docs.aiDocIndexRelativePath", DEFAULT_AI_INDEX_REL) ??
      DEFAULT_AI_INDEX_REL
  );
  const semanticIndexGlob = sanitizeSemanticGlob(
    cfg.get<string>("docs.semanticIndexGlob", DEFAULT_SEMANTIC_GLOB) ??
      DEFAULT_SEMANTIC_GLOB
  );
  return { docsRoot, aiDocIndexRelativePath, semanticIndexGlob };
}

/** 文档根目录绝对路径（已规范化） */
export function resolveDocsDirAbs(workspaceRoot: string): string {
  const { docsRoot } = getObservatoryDocsSettings(workspaceRoot);
  return path.resolve(workspaceRoot, docsRoot);
}

/** ai-doc-index.json 绝对路径 */
export function resolveAiDocIndexAbsPath(workspaceRoot: string): string {
  const { docsRoot, aiDocIndexRelativePath } = getObservatoryDocsSettings(workspaceRoot);
  return path.resolve(workspaceRoot, docsRoot, aiDocIndexRelativePath);
}

export function safeUnderRoot(rootAbs: string, candidateAbs: string): boolean {
  const normRoot = path.resolve(rootAbs);
  const norm = path.resolve(candidateAbs);
  return norm === normRoot || norm.startsWith(normRoot + path.sep);
}
