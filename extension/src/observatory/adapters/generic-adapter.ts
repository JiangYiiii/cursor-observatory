/**
 * 泛型仓库：不做框架推断，按路径目录聚合「影响面」。
 */
import * as path from "node:path";
import type { ProjectAdapter } from "./project-adapter";

export class GenericProjectAdapter implements ProjectAdapter {
  constructor(_workspaceRoot: string) {}

  async identifyModules(): Promise<string[]> {
    return [];
  }

  async identifyApplications(): Promise<string[]> {
    return [];
  }

  async suggestTestCommand(): Promise<string> {
    return "请根据仓库 README / package.json / Makefile 选择测试命令（如 npm test、mvn test、pytest）";
  }

  async extractAffectedServices(
    workspaceRoot: string,
    changedFiles: string[]
  ): Promise<string[]> {
    const root = path.normalize(workspaceRoot);
    const set = new Set<string>();
    for (const f of changedFiles) {
      const abs = path.isAbsolute(f) ? f : path.join(root, f);
      const rel = path.relative(root, abs);
      const top = rel.split(path.sep).filter(Boolean)[0];
      if (top) set.add(top);
    }
    return [...set].sort();
  }
}
