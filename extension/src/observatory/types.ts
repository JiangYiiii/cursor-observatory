/**
 * TypeScript shapes for `.observatory/*.json` (aligned with docs/SCHEMA_SPEC.md).
 * primary_doc: docs/SCHEMA_SPEC.md
 */
export interface Manifest {
  schema_version: string;
  project: Record<string, unknown>;
  observatory?: Record<string, unknown>;
  metadata_sources?: Record<string, unknown>;
}

export interface Architecture {
  schema_version: string;
  generated_at?: string;
  modules: unknown[];
  edges: unknown[];
  layers?: unknown[];
}

export interface Capabilities {
  schema_version: string;
  generated_at?: string;
  capabilities: unknown[];
}

export interface Progress {
  schema_version: string;
  generated_at?: string;
  summary?: Record<string, unknown>;
  timeline: unknown[];
}

export interface TestResults {
  schema_version: string;
  last_run: string;
  runner: string;
  summary: Record<string, unknown>;
  test_cases: unknown[];
  by_capability?: Record<string, unknown>;
}

export interface TestMapping {
  schema_version: string;
  generated_at?: string;
  generation_method?: string;
  mappings: unknown[];
}

export interface TestExpectations {
  schema_version: string;
  generated_at?: string;
  expectations: Record<string, unknown>;
}

export interface AiSessions {
  schema_version: string;
  sessions: unknown[];
}

export interface DataModels {
  schema_version: string;
  generated_at?: string;
  source_files?: string[];
  tables: unknown[];
  relationships?: unknown[];
}

export interface DocsHealth {
  schema_version: string;
  generated_at?: string;
  overall_score?: number;
  checks: unknown[];
}

export interface SessionIndex {
  schema_version: string;
  generated_at?: string;
  sessions: Array<Record<string, unknown>>;
}

export interface TestHistoryLineV1 {
  v: number;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration_ms?: number;
  by_capability?: Record<string, unknown>;
}

/** Known JSON filenames under `.observatory/` (excluding JSONL). */
export const OBSERVATORY_JSON_FILES = [
  "manifest.json",
  "architecture.json",
  "capabilities.json",
  "progress.json",
  "data-models.json",
  "ai-sessions.json",
  "test-results.json",
  "test-mapping.json",
  "test-expectations.json",
  "docs-health.json",
  "sessions/index.json",
] as const;

export type ObservatoryJsonFile = (typeof OBSERVATORY_JSON_FILES)[number];
