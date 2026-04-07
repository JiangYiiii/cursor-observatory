import { ObservatoryStore } from "../observatory/store";
import { DocScanner } from "./doc-scanner";

/** Lightweight refresh for diagnostic watcher (docs-health only). */
export async function runDocScanOnly(
  workspaceRoot: string,
  store: ObservatoryStore
): Promise<void> {
  const doc = new DocScanner();
  const health = await doc.scanDocsHealth(workspaceRoot);
  await store.writeDocsHealth(health);
}
