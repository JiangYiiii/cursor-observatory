/**
 * 当前分支相对上游（或推断的远端主分支）的提交与 diff，供「发布说明 / 准入准出」Prompt 注入。
 */
import simpleGit, { type SimpleGit } from "simple-git";
import { getCurrentGitState, resolveCompareUpstreamRef } from "./git-utils";

const MAX_DIFF_CHARS = 100_000;
const MAX_COMMITS_FULL_MSG = 40;
const MAX_PORCELAIN_LINES = 35;

async function safeRaw(git: SimpleGit, args: string[]): Promise<string> {
  try {
    return (await git.raw(args)) ?? "";
  } catch {
    return "";
  }
}

export type ReleaseDiffPayload =
  | {
      ok: true;
      currentBranch: string;
      headCommit: string;
      upstreamRef: string;
      mergeBase: string;
      commitsAhead: number;
      filesChanged: number;
      statBlock: string;
      commitMessagesBlock: string;
      diffPatch: string;
      diffTruncated: boolean;
      workingTreeNote: string;
    }
  | {
      ok: false;
      reason: string;
      currentBranch?: string;
      hint?: string;
    };

export async function getReleaseDiffPayload(
  workspaceRoot: string
): Promise<ReleaseDiffPayload> {
  const git = simpleGit(workspaceRoot);
  const st = await getCurrentGitState(workspaceRoot);
  const upstream = await resolveCompareUpstreamRef(git);
  if (!upstream) {
    return {
      ok: false,
      reason: "无法解析对比基准分支",
      currentBranch: st.branch,
      hint: "请为当前分支设置上游（如 git branch -u origin/<branch>），或确保存在 origin/main、origin/master 等远端引用。",
    };
  }

  let mergeBase = "";
  try {
    mergeBase = (await git.raw(["merge-base", upstream, "HEAD"])).trim();
  } catch {
    mergeBase = "";
  }
  if (!mergeBase) {
    return {
      ok: false,
      reason: `无法计算 merge-base（upstream=${upstream}）`,
      currentBranch: st.branch,
      hint: "请确认远端已 fetch，且上游分支与当前分支有共同历史。",
    };
  }

  const statBlock = (
    await safeRaw(git, ["diff", "--stat", `${mergeBase}..HEAD`])
  ).trimEnd();

  const nameOnly = await safeRaw(git, [
    "diff",
    "--name-only",
    `${mergeBase}..HEAD`,
  ]);
  const filesChanged = nameOnly
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  let commitsAhead = 0;
  try {
    const cnt = (
      await safeRaw(git, ["rev-list", "--count", `${mergeBase}..HEAD`])
    ).trim();
    const n = parseInt(cnt, 10);
    commitsAhead = Number.isFinite(n) ? n : 0;
  } catch {
    commitsAhead = 0;
  }

  const commitMessagesBlock = (
    await safeRaw(git, [
      "log",
      `${mergeBase}..HEAD`,
      "--reverse",
      `--max-count=${MAX_COMMITS_FULL_MSG}`,
      "--format=%H %s%n%b---COMMIT---",
    ])
  ).trimEnd();

  let diffPatch = await safeRaw(git, ["diff", `${mergeBase}..HEAD`]);
  let diffTruncated = false;
  if (diffPatch.length > MAX_DIFF_CHARS) {
    diffTruncated = true;
    diffPatch =
      diffPatch.slice(0, MAX_DIFF_CHARS) +
      `\n\n… [diff 已截断，总长度超过 ${MAX_DIFF_CHARS} 字符；请在仓库内执行 git diff ${mergeBase}..HEAD 查看完整补丁]`;
  }

  const porcelain = (await safeRaw(git, ["status", "--porcelain"])).trimEnd();
  let workingTreeNote = "";
  if (porcelain.length > 0) {
    const lines = porcelain.split(/\r?\n/).filter(Boolean);
    const head = lines.slice(0, MAX_PORCELAIN_LINES);
    const more = lines.length > MAX_PORCELAIN_LINES;
    workingTreeNote = [
      "以下为本分支相对上游提交之外，**工作区未提交变更**（节选）：",
      ...head.map((l) => `  ${l}`),
      more ? `  … 另有 ${lines.length - MAX_PORCELAIN_LINES} 行` : "",
      "",
      "生成准入准出说明时请一并考虑未提交改动的风险；必要时可先 stash / 提交后再复制本 Prompt。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    ok: true,
    currentBranch: st.branch,
    headCommit: st.headCommit,
    upstreamRef: upstream,
    mergeBase,
    commitsAhead,
    filesChanged,
    statBlock: statBlock || "（无文件级 stat 输出）",
    commitMessagesBlock:
      commitMessagesBlock || "（范围内无提交消息，或范围为空）",
    diffPatch: diffPatch || "（空 diff）",
    diffTruncated,
    workingTreeNote,
  };
}
