/**
 * 单例数据源，供 Zustand store 与各视图复用。
 * primary_doc: docs/FRONTEND_DESIGN.md §五
 */
import { createDataSource } from "./data-source";
import type { IDataSource } from "./idata-source";

let instance: IDataSource | null = null;

export function getDataSource(): IDataSource {
  if (!instance) {
    instance = createDataSource();
  }
  return instance;
}

/** 切换多根工作区中的当前项目后重建数据源 */
export function resetDataSourceForWorkspace(workspaceRoot: string): void {
  const prev = instance;
  prev?.dispose?.();
  instance = createDataSource({ workspaceRoot });
}

/** 测试注入 */
export function __setDataSourceForTest(ds: IDataSource | null): void {
  instance?.dispose?.();
  instance = ds;
}
