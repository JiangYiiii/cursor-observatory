/**
 * JSON Schema validation (AJV 2020-12) for `.observatory/*.json`.
 * primary_doc: docs/SCHEMA_SPEC.md §1.5
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ObservatoryError } from "./errors";

/** Normalized relative paths under `.observatory/`. */
const FILENAME_TO_SCHEMA: Record<string, string> = {
  "manifest.json": "manifest.schema.json",
  "architecture.json": "architecture.schema.json",
  "capabilities.json": "capabilities.schema.json",
  "progress.json": "progress.schema.json",
  "data-models.json": "data-models.schema.json",
  "ai-sessions.json": "ai-sessions.schema.json",
  "test-results.json": "test-results.schema.json",
  "report.json": "test-results.schema.json",
  "test-mapping.json": "test-mapping.schema.json",
  "test-expectations.json": "test-expectations.schema.json",
  "docs-health.json": "docs-health.schema.json",
  "sessions/index.json": "sessions-index.schema.json",
};

function normalizeRelativePath(p: string): string {
  return p.split(path.sep).join("/");
}

function resolveSchemaDir(): string {
  const fromBundle = path.join(__dirname, "schemas");
  if (fs.existsSync(fromBundle)) {
    return fromBundle;
  }
  const fromDev = path.join(__dirname, "..", "..", "..", "schemas");
  if (fs.existsSync(fromDev)) {
    return fromDev;
  }
  throw new Error(
    "Observatory: JSON schemas not found (expected dist/schemas or repo/schemas)."
  );
}

export class ObservatoryValidator {
  private readonly ajv: Ajv2020;
  private readonly validators = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  private getValidator(relativePath: string): ValidateFunction | undefined {
    const key = normalizeRelativePath(relativePath);
    const schemaFile = FILENAME_TO_SCHEMA[key];
    if (!schemaFile) return undefined;

    const cached = this.validators.get(key);
    if (cached) return cached;

    const dir = resolveSchemaDir();
    const schemaPath = path.join(dir, schemaFile);
    if (!fs.existsSync(schemaPath)) {
      return undefined;
    }
    const raw = fs.readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(raw) as object;
    const validate = this.ajv.compile(schema);
    this.validators.set(key, validate);
    return validate;
  }

  validate(relativePath: string, data: unknown): void {
    const key = normalizeRelativePath(relativePath);
    const validate = this.getValidator(key);
    if (!validate) return;
    const ok = validate(data);
    if (!ok) {
      throw new ObservatoryError({
        code: "SCHEMA_VALIDATION_FAILED",
        message: `${key} does not match JSON Schema`,
        detail: { file: key, errors: validate.errors ?? [] },
        retryable: false,
      });
    }
  }

  isRegistered(relativePath: string): boolean {
    const key = normalizeRelativePath(relativePath);
    return Boolean(FILENAME_TO_SCHEMA[key]);
  }
}
