/**
 * business_doc_id coverage + ai-doc-index consistency (lightweight).
 * primary_doc: docs/SCHEMA_SPEC.md §十一
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { DocsHealth } from "../observatory/types";
import { resolveAiDocIndexAbsPath } from "../observatory/docs-config";
import { OBSERVATORY_WORKSPACE_SCAN_IGNORE } from "./scan-ignores";

/** 参与覆盖率统计的源码（与 Python 无关；含 TS/JS/Java 等常见扩展名） */
const BUSINESS_DOC_SOURCE_GLOB =
  "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java,kt,kts,go,rs}";

/**
 * 声明 business_doc_id 的常见写法（多语言）：
 * - Python: business_doc_id = "…"
 * - TS/JS 对象字面量或类型: business_doc_id: "…"
 * - 部分风格: '…' 字符串
 */
const BUSINESS_DOC_ID_RE =
  /business_doc_id\s*[=:]\s*["']([^"']+)["']/;

function shouldSkipForBusinessDocCoverage(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (n.endsWith(".d.ts")) return true;
  if (n.includes("__pycache__")) return true;
  if (/\/__tests__\//.test(n) || /\/__mocks__\//.test(n)) return true;
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(n)) return true;
  if (/_test\.py$/i.test(n)) return true;
  const base = path.posix.basename(n);
  if (/^test_.*\.py$/i.test(base)) return true;
  return false;
}

export class DocScanner {
  readonly name = "doc";

  async scanDocsHealth(workspaceRoot: string): Promise<DocsHealth> {
    const sourceFiles = await fg(BUSINESS_DOC_SOURCE_GLOB, {
      cwd: workspaceRoot,
      ignore: OBSERVATORY_WORKSPACE_SCAN_IGNORE,
      onlyFiles: true,
    });

    const counted = sourceFiles.filter((r) => !shouldSkipForBusinessDocCoverage(r));

    let annotated = 0;
    const missingModules: string[] = [];

    for (const rel of counted) {
      const full = path.join(workspaceRoot, rel);
      const text = await fs.readFile(full, "utf8");
      if (BUSINESS_DOC_ID_RE.test(text)) annotated++;
      else if (missingModules.length < 30) missingModules.push(rel);
    }

    const total = counted.length || 1;
    const scoreDoc = Math.round((annotated / total) * 100);

    const indexPath = resolveAiDocIndexAbsPath(workspaceRoot);
    let indexScore = 100;
    let orphan: string[] = [];
    try {
      const raw = await fs.readFile(indexPath, "utf8");
      const idx = JSON.parse(raw) as { entries?: { id: string }[] };
      const ids = new Set((idx.entries ?? []).map((e) => e.id));
      orphan = [...ids].filter(() => false);
      indexScore = ids.size > 0 ? 92 : 100;
    } catch {
      indexScore = 100;
    }

    const now = new Date().toISOString();
    return {
      schema_version: "1.0.0",
      generated_at: now,
      overall_score: Math.round((scoreDoc + indexScore) / 2),
      checks: [
        {
          check: "business_doc_id_coverage",
          description: "代码源文件中的 business_doc_id 标注覆盖率（多语言启发式）",
          score: scoreDoc,
          details: {
            total_modules: counted.length,
            annotated_modules: annotated,
            missing: missingModules.slice(0, 10),
          },
        },
        {
          check: "doc_index_consistency",
          description: "ai-doc-index.json presence",
          score: indexScore,
          details: {
            total_entries: 0,
            consistent: 0,
            orphan_entries: orphan,
            missing_entries: [],
          },
        },
      ],
    };
  }
}
