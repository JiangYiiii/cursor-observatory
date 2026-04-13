/**
 * 文档浏览 / catalog / 语义索引：供 local-server 与 bridge 共用。
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import {
  getObservatoryDocsSettings,
  resolveDocsDirAbs,
  safeUnderRoot,
} from "./docs-config";
import { ObservatoryError } from "./errors";

const DOCS_MD_IGNORE: string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
];

/** 与任务卡一致：树中最多文件数（再组装目录节点） */
export const MAX_DOCS_TREE_FILES = 2000;
export const MAX_DOCS_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_AI_INDEX_FILES = 100;

export type DocsTreeNode = {
  name: string;
  /** 相对文档根，POSIX 风格 */
  relativePath: string;
  type: "file" | "dir";
  children?: DocsTreeNode[];
};

export type DocsTreeResult = {
  root: DocsTreeNode;
  truncated: boolean;
  docsRootExists: boolean;
};

function emptyDirRoot(): DocsTreeNode {
  return { name: "", relativePath: "", type: "dir", children: [] };
}

function insertFile(root: DocsTreeNode, relPosix: string): void {
  const parts = relPosix.split("/").filter(Boolean);
  if (parts.length === 0) return;
  let cur = root;
  const fileName = parts[parts.length - 1]!;
  const dirParts = parts.slice(0, -1);
  let acc: string[] = [];
  for (const seg of dirParts) {
    acc.push(seg);
    const rel = acc.join("/");
    if (!cur.children) cur.children = [];
    let next = cur.children.find((c) => c.name === seg && c.type === "dir");
    if (!next) {
      next = { name: seg, relativePath: rel, type: "dir", children: [] };
      cur.children.push(next);
    }
    cur = next;
  }
  if (!cur.children) cur.children = [];
  const fileRel = relPosix;
  if (!cur.children.some((c) => c.name === fileName && c.type === "file")) {
    cur.children.push({
      name: fileName,
      relativePath: fileRel,
      type: "file",
    });
  }
}

function sortTree(node: DocsTreeNode): void {
  if (!node.children?.length) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) {
    if (c.type === "dir") sortTree(c);
  }
}

export async function getDocsTree(workspaceRoot: string): Promise<DocsTreeResult> {
  const docsDir = resolveDocsDirAbs(workspaceRoot);
  try {
    const st = await fsp.stat(docsDir);
    if (!st.isDirectory()) {
      return { root: emptyDirRoot(), truncated: false, docsRootExists: false };
    }
  } catch {
    return { root: emptyDirRoot(), truncated: false, docsRootExists: false };
  }

  let files = await fg("**/*.md", {
    cwd: docsDir,
    onlyFiles: true,
    ignore: DOCS_MD_IGNORE,
    dot: false,
  });
  const truncated = files.length > MAX_DOCS_TREE_FILES;
  if (truncated) {
    files = files.slice(0, MAX_DOCS_TREE_FILES);
  }
  files.sort();
  const root = emptyDirRoot();
  for (const f of files) {
    const posix = f.replace(/\\/g, "/");
    insertFile(root, posix);
  }
  sortTree(root);
  return { root, truncated, docsRootExists: true };
}

/** 校验并返回相对文档根的 POSIX 路径，非法时抛错 */
export function parseDocsRelativePathParam(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) {
    throw new ObservatoryError({
      code: "BAD_REQUEST",
      message: "invalid relativePath",
      detail: {},
      retryable: false,
    });
  }
  const decoded = decodeURIComponent(raw);
  const norm = path.normalize(decoded).replace(/\\/g, "/");
  if (path.isAbsolute(decoded) || norm.startsWith("/") || norm.includes("../")) {
    throw new ObservatoryError({
      code: "BAD_REQUEST",
      message: "path must be relative to docs root",
      detail: {},
      retryable: false,
    });
  }
  const posix = norm.replace(/^\/+/, "");
  if (!posix || posix.includes("../")) {
    throw new ObservatoryError({
      code: "BAD_REQUEST",
      message: "invalid relativePath",
      detail: {},
      retryable: false,
    });
  }
  return posix;
}

export async function readDocsFileUtf8(
  workspaceRoot: string,
  relativePosix: string
): Promise<{ relativePath: string; content: string; encoding: "utf-8" }> {
  const docsDir = resolveDocsDirAbs(workspaceRoot);
  try {
    await fsp.stat(docsDir);
  } catch {
    throw new ObservatoryError({
      code: "NOT_FOUND",
      message: "docs root does not exist",
      detail: {},
      retryable: false,
    });
  }
  const full = path.resolve(docsDir, relativePosix);
  if (!safeUnderRoot(docsDir, full)) {
    throw new ObservatoryError({
      code: "BAD_REQUEST",
      message: "path escapes docs root",
      detail: {},
      retryable: false,
    });
  }
  let st;
  try {
    st = await fsp.stat(full);
  } catch {
    throw new ObservatoryError({
      code: "NOT_FOUND",
      message: "file not found",
      detail: { relativePath: relativePosix },
      retryable: false,
    });
  }
  if (!st.isFile()) {
    throw new ObservatoryError({
      code: "BAD_REQUEST",
      message: "not a file",
      detail: {},
      retryable: false,
    });
  }
  if (st.size > MAX_DOCS_FILE_BYTES) {
    throw new ObservatoryError({
      code: "PAYLOAD_TOO_LARGE",
      message: `file exceeds ${MAX_DOCS_FILE_BYTES} bytes`,
      detail: { size: st.size },
      retryable: false,
    });
  }
  const buf = await fsp.readFile(full);
  if (buf.length > MAX_DOCS_FILE_BYTES) {
    throw new ObservatoryError({
      code: "PAYLOAD_TOO_LARGE",
      message: "file too large",
      detail: {},
      retryable: false,
    });
  }
  let content: string;
  try {
    content = buf.toString("utf8");
  } catch {
    throw new ObservatoryError({
      code: "READ_FAILED",
      message: "invalid UTF-8",
      detail: {},
      retryable: false,
    });
  }
  return { relativePath: relativePosix.replace(/\\/g, "/"), content, encoding: "utf-8" };
}

export async function readDocsCatalogIfExists(
  workspaceRoot: string
): Promise<unknown | null> {
  const docsDir = resolveDocsDirAbs(workspaceRoot);
  const full = path.resolve(docsDir, "00-meta", "docs-catalog.json");
  if (!safeUnderRoot(docsDir, full)) return null;
  try {
    const text = await fsp.readFile(full, "utf8");
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export type AiIndexSummary = {
  relativePath: string;
  domain?: string;
  flow?: string;
  anchorCount: number;
  docLinks: string[];
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function listAiIndexSummaries(
  workspaceRoot: string
): Promise<{ items: AiIndexSummary[]; truncated: boolean }> {
  const { semanticIndexGlob } = getObservatoryDocsSettings(workspaceRoot);
  const docsDir = resolveDocsDirAbs(workspaceRoot);
  try {
    const st = await fsp.stat(docsDir);
    if (!st.isDirectory()) return { items: [], truncated: false };
  } catch {
    return { items: [], truncated: false };
  }

  const pattern = semanticIndexGlob.replace(/\\/g, "/");
  let files = await fg(pattern, {
    cwd: docsDir,
    onlyFiles: true,
    ignore: DOCS_MD_IGNORE,
    dot: true,
  });
  const truncated = files.length > MAX_AI_INDEX_FILES;
  if (truncated) {
    files = files.slice(0, MAX_AI_INDEX_FILES);
  }

  const items: AiIndexSummary[] = [];
  for (const rel of files) {
    const posix = rel.replace(/\\/g, "/");
    const full = path.resolve(docsDir, posix);
    if (!safeUnderRoot(docsDir, full)) continue;
    try {
      const text = await fsp.readFile(full, "utf8");
      const j = JSON.parse(text) as Record<string, unknown>;
      const domain = asString(j.domain);
      const flow = asString(j.flow);
      let docLinks: string[] = [];
      const doc = j.documentation;
      if (typeof doc === "string") docLinks = [doc];
      else if (doc && typeof doc === "object" && !Array.isArray(doc)) {
        const o = doc as Record<string, unknown>;
        const d = asString(o.path) ?? asString(o.file);
        if (d) docLinks = [d];
      }
      const anchors = j.anchors;
      const anchorCount = Array.isArray(anchors) ? anchors.length : 0;
      items.push({
        relativePath: posix,
        domain,
        flow,
        anchorCount,
        docLinks,
      });
    } catch {
      items.push({
        relativePath: posix,
        anchorCount: 0,
        docLinks: [],
      });
    }
  }
  return { items, truncated };
}
