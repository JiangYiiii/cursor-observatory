/**
 * Scanner contracts.
 * primary_doc: docs/EXTENSION_DESIGN.md §4.1
 */

export interface ScanResult {
  modules: unknown[];
  edges: unknown[];
}

export interface Scanner {
  readonly name: string;
  readonly supportedLanguages: string[];

  detect(workspaceRoot: string): Promise<boolean>;
  scan(workspaceRoot: string): Promise<ScanResult>;
}
