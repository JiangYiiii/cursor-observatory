/**
 * Unified error shape for Store / API / Bridge（与 docs/ARCHITECTURE.md §4.2 / §十一 一致）。
 * primary_doc: docs/SCHEMA_SPEC.md §1.4, docs/ARCHITECTURE.md §十一
 */
export interface ObservatoryErrorPayload {
  code: string;
  message: string;
  detail?: unknown;
  retryable: boolean;
}

/** 与 HTTP / Bridge JSON 错误体对齐的别名 */
export type ObservatoryErrorShape = ObservatoryErrorPayload;

export class ObservatoryError extends Error {
  readonly code: string;
  readonly detail?: unknown;
  readonly retryable: boolean;

  constructor(payload: ObservatoryErrorPayload) {
    super(payload.message);
    this.name = "ObservatoryError";
    this.code = payload.code;
    this.detail = payload.detail;
    this.retryable = payload.retryable;
  }

  toJSON(): ObservatoryErrorPayload {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      retryable: this.retryable,
    };
  }
}

export function observatoryErrorFromUnknown(
  e: unknown,
  fallbackCode = "INTERNAL"
): ObservatoryErrorPayload {
  if (e instanceof ObservatoryError) return e.toJSON();
  const msg = e instanceof Error ? e.message : String(e);
  return {
    code: fallbackCode,
    message: msg,
    detail: e instanceof Error ? { name: e.name } : {},
    retryable: false,
  };
}
