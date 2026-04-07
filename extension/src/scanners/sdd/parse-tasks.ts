/**
 * 解析 specs/<feature>/tasks.md 中的 Markdown checkbox 进度。
 */

const TASK_LINE = /^-\s*\[([ xX])\]\s*/;

export interface TaskProgress {
  total: number;
  completed: number;
}

/**
 * progress = completed / total * 100（total 为 0 时返回 0）
 */
export function parseTaskProgress(content: string): TaskProgress {
  const lines = content.split(/\r?\n/);
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    const m = line.match(TASK_LINE);
    if (!m) continue;
    total += 1;
    const mark = m[1];
    if (mark === "x" || mark === "X") completed += 1;
  }
  return { total, completed };
}

export function taskProgressPercent(p: TaskProgress): number {
  if (p.total <= 0) return 0;
  return Math.round((100 * p.completed) / p.total);
}
