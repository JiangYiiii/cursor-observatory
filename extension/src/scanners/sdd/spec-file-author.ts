/**
 * 解析 spec.md 首次加入版本库的作者名；失败则回退 git config / OS 用户。
 */
import * as os from "node:os";
import * as path from "node:path";
import simpleGit from "simple-git";

function trimLine(s: string): string {
  return s.replace(/\r?\n/g, "").trim();
}

async function gitConfigUserName(
  workspaceRoot: string
): Promise<string | null> {
  try {
    const git = simpleGit(workspaceRoot);
    const out = await git.raw(["config", "user.name"]);
    const t = trimLine(out);
    return t.length ? t : null;
  } catch {
    return null;
  }
}

export async function resolveDefaultAuthorName(
  workspaceRoot: string
): Promise<string> {
  const g = await gitConfigUserName(workspaceRoot);
  if (g) return g;
  try {
    return os.userInfo().username || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 首次添加 spec 文件的提交作者（--diff-filter=A）；若无法解析则回退默认名。
 */
export async function getSpecFileFirstAuthor(
  workspaceRoot: string,
  specAbsolutePath: string
): Promise<string> {
  const rel = path.relative(workspaceRoot, specAbsolutePath);
  const norm = rel.split(path.sep).join("/");
  if (!norm || norm.startsWith("..")) {
    return resolveDefaultAuthorName(workspaceRoot);
  }

  const tryLog = async (follow: boolean): Promise<string | null> => {
    try {
      const git = simpleGit(workspaceRoot);
      const args = [
        "log",
        "--diff-filter=A",
        "-1",
        ...(follow ? (["--follow"] as const) : []),
        "--format=%an",
        "--",
        norm,
      ];
      const out = await git.raw(args);
      const name = trimLine(out);
      return name.length ? name : null;
    } catch {
      return null;
    }
  };

  const withFollow = await tryLog(true);
  if (withFollow) return withFollow;
  const noFollow = await tryLog(false);
  if (noFollow) return noFollow;

  return resolveDefaultAuthorName(workspaceRoot);
}
