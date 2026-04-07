/**
 * Python package / import analysis → architecture.json shape.
 * primary_doc: docs/EXTENSION_DESIGN.md §4.2
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { Architecture } from "../observatory/types";
import type { ScanResult, Scanner } from "./base-scanner";
import { OBSERVATORY_WORKSPACE_SCAN_IGNORE } from "./scan-ignores";

const IMPORT_RE =
  /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+)|import\s+([\w.]+)\s+as)/;

function topLevelModule(mod: string): string {
  return mod.split(".")[0] ?? mod;
}

export class PythonScanner implements Scanner {
  readonly name = "python";
  readonly supportedLanguages = ["python"];

  async detect(workspaceRoot: string): Promise<boolean> {
    const markers = ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"];
    for (const m of markers) {
      try {
        await fs.access(path.join(workspaceRoot, m));
        return true;
      } catch {
        /* continue */
      }
    }
    const py = await fg("**/*.py", {
      cwd: workspaceRoot,
      ignore: OBSERVATORY_WORKSPACE_SCAN_IGNORE,
      onlyFiles: true,
      dot: false,
      deep: 5,
    });
    return py.length > 0;
  }

  async scan(workspaceRoot: string): Promise<ScanResult> {
    const pyFiles = await fg("**/*.py", {
      cwd: workspaceRoot,
      ignore: OBSERVATORY_WORKSPACE_SCAN_IGNORE,
      onlyFiles: true,
      dot: false,
    });

    const moduleDirs = new Map<
      string,
      {
        id: string;
        files: { path: string; lines: number; functions: number; classes: number }[];
        imports: Set<string>;
      }
    >();

    for (const rel of pyFiles) {
      const dir = path.posix.dirname(rel);
      const pkg =
        dir === "." || dir === ""
          ? "__root__"
          : dir.split("/")[0] ?? "__root__";
      const modId = pkg === "__root__" ? "__root__" : pkg;

      if (!moduleDirs.has(modId)) {
        moduleDirs.set(modId, {
          id: modId,
          files: [],
          imports: new Set<string>(),
        });
      }
      const entry = moduleDirs.get(modId)!;
      const full = path.join(workspaceRoot, rel);
      const content = await fs.readFile(full, "utf8");
      const lines = content.split("\n");
      let functions = 0;
      let classes = 0;
      for (const line of lines) {
        if (/^(?:async\s+)?def\s+\w+/.test(line.trim())) functions++;
        if (/^class\s+\w+/.test(line.trim())) classes++;
        const im = line.trim().match(IMPORT_RE);
        if (im) {
          const raw = im[1] ?? im[2] ?? im[3];
          if (raw) entry.imports.add(topLevelModule(raw));
        }
      }
      entry.files.push({
        path: rel.replace(/\\/g, "/"),
        lines: lines.length,
        functions,
        classes,
      });
    }

    const internalRoots = new Set(moduleDirs.keys());
    const edges: { from: string; to: string; type: string; weight: number }[] =
      [];
    const edgeKey = new Set<string>();

    const modules = [...moduleDirs.values()].map((m) => {
      const internalImports = [...m.imports].filter(
        (x) => internalRoots.has(x) && x !== m.id
      );
      const stats = m.files.reduce(
        (a, f) => ({
          total_lines: a.total_lines + f.lines,
          total_functions: a.total_functions + f.functions,
          total_classes: a.total_classes + f.classes,
        }),
        { total_lines: 0, total_functions: 0, total_classes: 0 }
      );
      for (const to of internalImports) {
        const k = `${m.id}->${to}`;
        if (!edgeKey.has(k)) {
          edgeKey.add(k);
          edges.push({
            from: m.id,
            to,
            type: "import",
            weight: 1,
          });
        }
      }
      return {
        id: m.id,
        name: m.id,
        path: m.id === "__root__" ? "./" : `${m.id}/`,
        type: "package",
        language: "python",
        files: m.files,
        imports_from: [...m.imports].filter((x) => internalRoots.has(x)),
        imported_by: [] as string[],
        capability_ids: [] as string[],
        stats,
      };
    });

    const importedBy = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!importedBy.has(e.to)) importedBy.set(e.to, new Set());
      importedBy.get(e.to)!.add(e.from);
    }
    for (const mod of modules) {
      mod.imported_by = [...(importedBy.get(mod.id) ?? [])];
    }

    return { modules, edges };
  }

  async scanArchitecture(workspaceRoot: string): Promise<Architecture> {
    const { modules, edges } = await this.scan(workspaceRoot);
    const now = new Date().toISOString();
    return {
      schema_version: "1.0.0",
      generated_at: now,
      modules: modules as unknown[],
      edges: edges as unknown[],
      layers: [],
    };
  }
}
