/**
 * Java / Maven / Gradle：启发式识别 Spring Boot 应用与多模块目录。
 */
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { ProjectAdapter } from "./project-adapter";

async function walkJavaFiles(
  dir: string,
  maxFiles: number
): Promise<string[]> {
  const out: string[] = [];
  async function inner(d: string, depth: number): Promise<void> {
    if (out.length >= maxFiles || depth > 12) return;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const name = e.name;
      if (name === "node_modules" || name === "target" || name === "build") {
        continue;
      }
      const p = path.join(d, name);
      if (e.isDirectory()) {
        await inner(p, depth + 1);
      } else if (e.isFile() && name.endsWith(".java")) {
        out.push(p);
      }
    }
  }
  await inner(dir, 0);
  return out;
}

export class JavaSpringProjectAdapter implements ProjectAdapter {
  constructor(private readonly workspaceRoot: string) {}

  async identifyModules(): Promise<string[]> {
    const modules = new Set<string>();
    const pom = path.join(this.workspaceRoot, "pom.xml");
    try {
      const text = await fsp.readFile(pom, "utf8");
      const re = /<module>\s*([^<]+)\s*<\/module>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        modules.add(m[1].trim());
      }
    } catch {
      /* 单模块或无 pom */
    }
    if (modules.size === 0) {
      if (fs.existsSync(path.join(this.workspaceRoot, "src"))) {
        modules.add(".");
      }
    }
    return [...modules].sort();
  }

  async identifyApplications(): Promise<string[]> {
    const apps = new Set<string>();
    const files = await walkJavaFiles(this.workspaceRoot, 4000);
    for (const fp of files) {
      let text: string;
      try {
        text = await fsp.readFile(fp, "utf8");
      } catch {
        continue;
      }
      if (
        /@SpringBootApplication\b/.test(text) ||
        /public\s+static\s+void\s+main\s*\(/.test(text)
      ) {
        const relDir = path.dirname(path.relative(this.workspaceRoot, fp));
        apps.add(relDir === "" ? "." : relDir);
      }
    }
    return [...apps].sort();
  }

  async suggestTestCommand(): Promise<string> {
    if (fs.existsSync(path.join(this.workspaceRoot, "pom.xml"))) {
      return "mvn test";
    }
    if (
      fs.existsSync(path.join(this.workspaceRoot, "gradlew")) ||
      fs.existsSync(path.join(this.workspaceRoot, "gradlew.bat"))
    ) {
      return "./gradlew test";
    }
    return "gradle test";
  }

  async extractAffectedServices(
    workspaceRoot: string,
    changedFiles: string[]
  ): Promise<string[]> {
    const apps = await this.identifyApplications();
    const norm = workspaceRoot;
    const hits = new Set<string>();
    for (const f of changedFiles) {
      const abs = path.isAbsolute(f) ? f : path.join(norm, f);
      const rel = path.relative(norm, abs);
      let best = "";
      for (const a of apps) {
        const prefix = a === "." ? "" : a + path.sep;
        if (!prefix || rel.startsWith(prefix)) {
          if (a.length > best.length) best = a;
        }
      }
      if (best) {
        hits.add(best === "." ? "root" : best);
      } else {
        hits.add(path.dirname(rel).split(path.sep)[0] ?? rel);
      }
    }
    return [...hits].sort();
  }
}
