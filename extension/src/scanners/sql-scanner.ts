/**
 * Lightweight DDL parse → data-models.json.
 * primary_doc: docs/EXTENSION_DESIGN.md §4.3
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { DataModels } from "../observatory/types";
import { OBSERVATORY_WORKSPACE_SCAN_IGNORE } from "./scan-ignores";

const TABLE_NAME_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"]?[\w]+[`"]?\.)?[`"]?([\w]+)[`"]?/gi;

export class SqlScanner {
  readonly name = "sql";

  async scanDataModels(workspaceRoot: string): Promise<DataModels> {
    const sqlFiles = await fg(["**/sql/**/*.sql", "**/*.sql"], {
      cwd: workspaceRoot,
      ignore: OBSERVATORY_WORKSPACE_SCAN_IGNORE,
      onlyFiles: true,
      dot: false,
    });

    const tables: unknown[] = [];
    const relationships: unknown[] = [];
    const sourceFiles: string[] = [];

    for (const rel of sqlFiles) {
      sourceFiles.push(rel.replace(/\\/g, "/"));
      const full = path.join(workspaceRoot, rel);
      const content = await fs.readFile(full, "utf8");
      let m: RegExpExecArray | null;
      const re = new RegExp(TABLE_NAME_RE.source, TABLE_NAME_RE.flags);
      while ((m = re.exec(content)) !== null) {
        const tableName = m[1];
        if (!tableName || /^(IF|NOT|EXISTS)$/i.test(tableName)) continue;
        tables.push({
          name: tableName,
          schema: "public",
          columns: [],
          indexes: [],
          foreign_keys: [],
        });
      }
    }

    const now = new Date().toISOString();
    return {
      schema_version: "1.0.0",
      generated_at: now,
      source_files: sourceFiles,
      tables: tables as unknown[],
      relationships,
    };
  }
}
