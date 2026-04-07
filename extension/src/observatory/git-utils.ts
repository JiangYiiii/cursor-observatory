/**
 * Git 工作区指纹与变更文件列表（需求面板 V2 影响分析）。
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export type ChangedFilesMode = "A" | "B" | "C";

export interface GetChangedFilesResult {
  mode: ChangedFilesMode;
  baseRef: string;
  files: string[];
}

export interface GetChangedFilesOptions {
  /** 显式基准分支或 ref（优先级最高） */
  baseRefOverride?: string;
  /** 模式 C：tasks.md 相对工作区路径，例如 specs/foo/tasks.md */
  tasksMdRelativePath?: string;
}

function uniqSorted(paths: string[]): string[] {
  return [...new Set(paths.map((p) => p.replace(/\\/g, "/")))].sort();
}

async function safeRaw(git: SimpleGit, args: string[]): Promise<string> {
  try {
    return (await git.raw(args)) ?? "";
  } catch {
    return "";
  }
}

/**
 * 工作区指纹：SHA256( binary diff HEAD + binary diff --cached + 未跟踪文件内容摘要 )
 */
export async function computeWorkingTreeFingerprint(
  workspaceRoot: string
): Promise<string> {
  const git = simpleGit(workspaceRoot);
  let chunk = "";
  chunk += await safeRaw(git, ["diff", "--binary", "HEAD"]);
  chunk += await safeRaw(git, ["diff", "--binary", "--cached"]);
  const untrackedOut = await safeRaw(git, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  const files = untrackedOut
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();
  for (const rel of files) {
    const fp = path.join(workspaceRoot, rel);
    chunk += `\nFILE:${rel}\n`;
    try {
      const buf = await fs.readFile(fp);
      chunk += createHash("sha256").update(buf).digest("hex");
    } catch {
      chunk += `MISSING:${rel}`;
    }
  }
  return createHash("sha256").update(chunk, "utf8").digest("hex");
}

/** 与 `getCurrentGitState` 返回值一致；供校验管线、测试引用。 */
export type CurrentGitState = {
  branch: string;
  headCommit: string;
  fingerprint: string;
};

export async function getCurrentGitState(
  workspaceRoot: string
): Promise<CurrentGitState> {
  const git = simpleGit(workspaceRoot);
  let branch = "NO_BRANCH";
  let headCommit = "NO_COMMITS";
  try {
    const b = await git.branchLocal();
    branch = b.current && b.current.length > 0 ? b.current : "NO_BRANCH";
  } catch {
    /* empty */
  }
  try {
    const h = (await git.revparse(["HEAD"])).trim();
    if (h) headCommit = h;
  } catch {
    /* empty */
  }
  const fingerprint = await computeWorkingTreeFingerprint(workspaceRoot);
  return { branch, headCommit, fingerprint };
}

async function inferBaseRef(
  git: SimpleGit,
  override?: string
): Promise<string | undefined> {
  if (override?.trim()) return override.trim();
  try {
    const up = await git.raw(["rev-parse", "--abbrev-ref", "@{u}"]).catch(
      () => ""
    );
    const u = up.trim();
    if (u && u !== "@{u}") return u;
  } catch {
    /* empty */
  }
  const candidates = [
    "origin/feature_branch_master",
    "origin/master",
    "origin/main",
  ];
  for (const c of candidates) {
    try {
      await git.revparse([c]);
      return c;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

async function workingTreeOnlyFiles(
  workspaceRoot: string,
  git: SimpleGit
): Promise<string[]> {
  const out: string[] = [];
  const d1 = await safeRaw(git, ["diff", "--name-only", "HEAD"]);
  for (const line of d1.split(/\r?\n/)) {
    const t = line.trim();
    if (t) out.push(t);
  }
  const d2 = await safeRaw(git, ["diff", "--name-only", "--cached"]);
  for (const line of d2.split(/\r?\n/)) {
    const t = line.trim();
    if (t) out.push(t);
  }
  const untracked = await safeRaw(git, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  for (const line of untracked.split(/\r?\n/)) {
    const t = line.trim();
    if (t) out.push(t);
  }
  return uniqSorted(out);
}

/**
 * 从 tasks.md 粗略提取路径（`- [ ] ... path/to/file` 或反引号路径）
 */
export function extractPathsFromTasksMd(text: string): string[] {
  const paths = new Set<string>();
  const backtick = /`([^`]+\.[a-zA-Z0-9]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = backtick.exec(text)) !== null) {
    const p = m[1]?.trim();
    if (p && !p.includes(" ") && (p.includes("/") || p.includes("\\"))) {
      paths.add(p.replace(/\\/g, "/"));
    }
  }
  const loose = /(?:^|\s)([\w./-]+\.(?:java|kt|ts|tsx|js|py|go|rs|md))\b/g;
  while ((m = loose.exec(text)) !== null) {
    const p = m[1]?.trim();
    if (p && p.includes("/")) paths.add(p.replace(/\\/g, "/"));
  }
  return [...paths].sort();
}

/**
 * 三模式变更文件获取：A 基准分支对比；B 仅工作区；C tasks.md 回溯。
 */
export async function getChangedFiles(
  workspaceRoot: string,
  options?: GetChangedFilesOptions
): Promise<GetChangedFilesResult> {
  const git = simpleGit(workspaceRoot);
  let headOk = false;
  try {
    await git.revparse(["HEAD"]);
    headOk = true;
  } catch {
    headOk = false;
  }

  const base = await inferBaseRef(git, options?.baseRefOverride);
  if (headOk && base) {
    try {
      const mb = (await git.raw(["merge-base", base, "HEAD"])).trim();
      if (mb) {
        const rangeFiles = await safeRaw(git, [
          "diff",
          "--name-only",
          `${mb}..HEAD`,
        ]);
        const fromRange = rangeFiles
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const wt = await workingTreeOnlyFiles(workspaceRoot, git);
        const merged = uniqSorted([...fromRange, ...wt]);
        if (merged.length > 0) {
          return { mode: "A", baseRef: mb, files: merged };
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (headOk) {
    const wt = await workingTreeOnlyFiles(workspaceRoot, git);
    if (wt.length > 0) {
      return { mode: "B", baseRef: "WORKING_TREE_ONLY", files: wt };
    }
  } else {
    try {
      const tracked = await safeRaw(git, ["ls-files"]);
      const tr = tracked
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const untracked = await safeRaw(git, [
        "ls-files",
        "--others",
        "--exclude-standard",
      ]);
      const ut = untracked
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const merged = uniqSorted([...tr, ...ut]);
      if (merged.length > 0) {
        return { mode: "B", baseRef: "WORKING_TREE_ONLY", files: merged };
      }
    } catch {
      /* empty */
    }
  }

  const tasksRel = options?.tasksMdRelativePath;
  if (tasksRel) {
    try {
      const abs = path.join(workspaceRoot, tasksRel);
      const text = await fs.readFile(abs, "utf8");
      const extracted = extractPathsFromTasksMd(text);
      if (extracted.length > 0) {
        return { mode: "C", baseRef: "TASKS_FALLBACK", files: extracted };
      }
    } catch {
      /* empty */
    }
  }

  return { mode: "C", baseRef: "TASKS_FALLBACK", files: [] };
}
