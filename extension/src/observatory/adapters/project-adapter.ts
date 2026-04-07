/**
 * 项目技术栈适配器：用于推断模块 / 可部署应用 / 测试命令 / 受影响服务名。
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { GenericProjectAdapter } from "./generic-adapter";
import { JavaSpringProjectAdapter } from "./java-spring-adapter";

export interface ProjectAdapter {
  /** 仓库内逻辑模块或子项目标识（目录相对路径或名称） */
  identifyModules(workspaceRoot: string): Promise<string[]>;
  /** 可独立部署的应用（如 Spring Boot 可执行 jar 对应模块） */
  identifyApplications(workspaceRoot: string): Promise<string[]>;
  /** 建议的测试命令（展示用） */
  suggestTestCommand(workspaceRoot: string): Promise<string>;
  /** 从变更文件路径推断受影响「服务」展示名 */
  extractAffectedServices(
    workspaceRoot: string,
    changedFiles: string[]
  ): Promise<string[]>;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 存在 `pom.xml` 或 Gradle 构建文件时使用 Java/Spring 启发式，否则使用泛型文件级策略。
 */
export async function createProjectAdapter(
  workspaceRoot: string
): Promise<ProjectAdapter> {
  const root = path.normalize(workspaceRoot);
  const hasPom = await pathExists(path.join(root, "pom.xml"));
  const hasGradle =
    (await pathExists(path.join(root, "build.gradle"))) ||
    (await pathExists(path.join(root, "build.gradle.kts")));
  if (hasPom || hasGradle) {
    return new JavaSpringProjectAdapter(root);
  }
  return new GenericProjectAdapter(root);
}

export { GenericProjectAdapter } from "./generic-adapter";
export { JavaSpringProjectAdapter } from "./java-spring-adapter";
