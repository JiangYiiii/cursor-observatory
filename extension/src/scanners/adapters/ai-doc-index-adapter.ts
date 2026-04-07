/**
 * Maps docs/00-meta/ai-doc-index.json → capabilities list.
 * primary_doc: docs/EXTENSION_DESIGN.md §4.5
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface AiDocCapability {
  id: string;
  title: string;
  primary_doc?: string;
  code_entry_points: string[];
  related_doc_ids: string[];
}

export class AiDocIndexAdapter {
  async loadCapabilities(workspaceRoot: string): Promise<AiDocCapability[]> {
    const indexPath = path.join(
      workspaceRoot,
      "docs/00-meta/ai-doc-index.json"
    );
    try {
      const raw = await fs.readFile(indexPath, "utf8");
      const data = JSON.parse(raw) as {
        entries?: Record<string, unknown>[];
      };
      const entries = Array.isArray(data.entries) ? data.entries : [];
      return entries.map((e) => ({
        id: String(e.id ?? ""),
        title: String(e.title ?? e.id ?? ""),
        primary_doc:
          typeof e.primary_doc === "string" ? e.primary_doc : undefined,
        code_entry_points: Array.isArray(e.code_hints)
          ? (e.code_hints as string[])
          : [],
        related_doc_ids: Array.isArray(e.related_doc_ids)
          ? (e.related_doc_ids as string[])
          : [],
      }));
    } catch {
      return [];
    }
  }
}
