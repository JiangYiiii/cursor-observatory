/**
 * 解析 specs/<feature>/bugfix-log.md（保守解析，见 docs/SDD_INTEGRATION_DESIGN §4.5）。
 */

import type { BugRootCause } from "./types";

const VALID_CAUSES: BugRootCause[] = [
  "SPEC_GAP",
  "DESIGN_FLAW",
  "TASK_MISS",
  "IMPL_DEVIATION",
  "IMPL_BUG",
];

function parseAttribution(line: string): BugRootCause | null {
  const m = line.match(/\*\*归因\*\*[:：]\s*(\w+)/);
  if (!m?.[1]) return null;
  const c = m[1].toUpperCase();
  return VALID_CAUSES.includes(c as BugRootCause) ? (c as BugRootCause) : null;
}

export interface BugfixLogStats {
  activeBugs: number;
  resolvedBugs: number;
  rootCauses: BugRootCause[];
}

/**
 * 按 `## BF-` 分块解析。
 */
export function parseBugfixLog(content: string): BugfixLogStats {
  const parts = content.split(/^##\s+BF-/m);
  let activeBugs = 0;
  let resolvedBugs = 0;
  const openCauses: BugRootCause[] = [];

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const headerEnd = block.indexOf("\n");
    const header = headerEnd >= 0 ? block.slice(0, headerEnd) : block;
    const body = headerEnd >= 0 ? block.slice(headerEnd + 1) : "";
    const isResolved =
      /\bRESOLVED\b/i.test(header) ||
      /\*\*状态\*\*[:：]\s*✅/i.test(body) ||
      /✅\s*RESOLVED/i.test(body);

    if (isResolved) {
      resolvedBugs += 1;
      continue;
    }

    const isOpen = /\bOPEN\b/i.test(header) || /🔴/.test(header);
    if (isOpen) {
      activeBugs += 1;
      const fullText = `BF-${block}`;
      for (const line of fullText.split(/\r?\n/)) {
        const a = parseAttribution(line);
        if (a) openCauses.push(a);
      }
    }
  }

  const rootCauses = [...new Set(openCauses)];
  return {
    activeBugs,
    resolvedBugs,
    rootCauses,
  };
}
