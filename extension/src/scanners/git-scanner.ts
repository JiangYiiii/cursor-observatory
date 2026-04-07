/**
 * Git log → progress timeline entries.
 * primary_doc: docs/SCHEMA_SPEC.md §五
 */
import simpleGit from "simple-git";
import type { Progress } from "../observatory/types";

export class GitScanner {
  readonly name = "git";

  async scanProgress(
    workspaceRoot: string,
    options?: { maxCount?: number }
  ): Promise<Pick<Progress, "summary" | "timeline">> {
    const git = simpleGit(workspaceRoot);
    let branch = "main";
    try {
      branch = (await git.branch()).current;
    } catch {
      /* not a git repo */
    }

    let log;
    try {
      log = await git.log({ maxCount: options?.maxCount ?? 40 });
    } catch {
      return {
        summary: {
          total_commits: 0,
          active_branch: branch,
          recent_days: 14,
        },
        timeline: [],
      };
    }

    const timeline: unknown[] = [];
    for (const c of log.all) {
      const ts = c.date ? new Date(c.date).toISOString() : new Date().toISOString();
      timeline.push({
        id: `prog_${c.hash}_${Date.now()}`,
        timestamp: ts,
        type: "commit",
        title: c.message?.split("\n")[0] ?? "commit",
        author: c.author_name ?? "",
        commit: { hash: c.hash, branch },
        stats: { files_changed: 0, insertions: 0, deletions: 0 },
        files: [] as unknown[],
        capability_ids: [] as string[],
        session_id: null,
      });
    }

    return {
      summary: {
        total_commits: log.total,
        active_branch: branch,
        recent_days: 14,
      },
      timeline,
    };
  }
}
