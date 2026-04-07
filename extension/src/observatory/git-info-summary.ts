/**
 * 供仪表盘展示的轻量 Git 信息（仅本地仓库）
 */
import simpleGit from "simple-git";
import { getCurrentGitState } from "./git-utils";

export async function getGitInfoSummary(workspaceRoot: string): Promise<{
  branch: string;
  headCommit: string;
  workingTreeFingerprint: string;
  lastCommitLine: string | null;
}> {
  const st = await getCurrentGitState(workspaceRoot);
  const git = simpleGit(workspaceRoot);
  let lastCommitLine: string | null = null;
  try {
    const log = await git.log({ maxCount: 1 });
    const latest = log.latest;
    if (latest?.hash) {
      const msg = (latest.message ?? "").split("\n")[0]?.trim() ?? "";
      lastCommitLine = `${latest.hash.slice(0, 7)} ${msg}`;
    }
  } catch {
    lastCommitLine = null;
  }
  return {
    branch: st.branch,
    headCommit: st.headCommit,
    workingTreeFingerprint: st.fingerprint,
    lastCommitLine,
  };
}
