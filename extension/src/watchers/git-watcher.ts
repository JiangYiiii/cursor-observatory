/**
 * Watches `.git` HEAD/refs and appends latest commit to progress.
 * primary_doc: docs/EXTENSION_DESIGN.md §3.2
 */
import * as vscode from "vscode";
import simpleGit from "simple-git";
import { applyReleasedFromCommitMessage } from "../capability/capability-lifecycle";
import type { ObservatoryStore } from "../observatory/store";

export class GitWatcher {
  private lastHash: string | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly store: ObservatoryStore,
    private readonly onAfterCommit?: () => void
  ) {}

  register(context: vscode.ExtensionContext): void {
    const pattern = new vscode.RelativePattern(
      this.workspaceRoot,
      ".git/{HEAD,refs/**,COMMIT_EDITMSG}"
    );
    const w = vscode.workspace.createFileSystemWatcher(pattern);
    const run = () => void this.onGitEvent();
    w.onDidChange(run);
    w.onDidCreate(run);
    context.subscriptions.push(w);
  }

  private async onGitEvent(): Promise<void> {
    const git = simpleGit(this.workspaceRoot);
    let log;
    try {
      log = await git.log({ maxCount: 1 });
    } catch {
      return;
    }
    const c = log.latest;
    if (!c?.hash) return;
    if (c.hash === this.lastHash) return;
    this.lastHash = c.hash;

    let branch = "main";
    try {
      branch = (await git.branch()).current;
    } catch {
      /* ignore */
    }

    const msg = c.message ?? "";
    const capIds = await applyReleasedFromCommitMessage(this.store, msg);

    const ts = c.date ? new Date(c.date).toISOString() : new Date().toISOString();
    await this.store.appendProgressTimelineEvent({
      id: `prog_${c.hash}_${Date.now()}`,
      timestamp: ts,
      type: "commit",
      title: msg.split("\n")[0] ?? "commit",
      author: c.author_name ?? "",
      commit: { hash: c.hash, branch },
      stats: { files_changed: 0, insertions: 0, deletions: 0 },
      files: [],
      capability_ids: capIds,
      session_id: null,
    });
    this.onAfterCommit?.();
  }
}
