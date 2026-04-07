/**
 * 与 Extension / HTTP API 对齐的错误对象（docs/ARCHITECTURE.md §4.2、§十一）。
 * primary_doc: docs/ARCHITECTURE.md §十一
 */
export interface ObservatoryErrorShape {
  code: string;
  message: string;
  detail?: unknown;
  retryable: boolean;
}

export class ObservatoryDataError extends Error {
  readonly code: string;
  readonly detail?: unknown;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    code: string = "OBSERVATORY_ERROR",
    statusOrRetry?: number | { status?: number; retryable?: boolean; detail?: unknown }
  ) {
    super(message);
    this.name = "ObservatoryDataError";
    this.code = code;
    if (typeof statusOrRetry === "number") {
      this.status = statusOrRetry;
      this.retryable = false;
    } else if (statusOrRetry && typeof statusOrRetry === "object") {
      this.status = statusOrRetry.status;
      this.retryable = statusOrRetry.retryable ?? false;
      this.detail = statusOrRetry.detail;
    } else {
      this.retryable = false;
    }
  }

  static fromHttpResponse(status: number, bodyText: string): ObservatoryDataError {
    try {
      const j = JSON.parse(bodyText) as Partial<ObservatoryErrorShape>;
      if (j && typeof j.code === "string" && typeof j.message === "string") {
        return new ObservatoryDataError(j.message, j.code, {
          status,
          retryable: j.retryable === true,
          detail: j.detail,
        });
      }
    } catch {
      /* 非 JSON */
    }
    return new ObservatoryDataError(
      bodyText?.trim() ? bodyText : `HTTP ${status}`,
      "HTTP_ERROR",
      { status, retryable: status >= 500 }
    );
  }

  static fromBridge(
    message: string,
    payload?: ObservatoryErrorShape
  ): ObservatoryDataError {
    if (payload) {
      return new ObservatoryDataError(payload.message, payload.code, {
        retryable: payload.retryable,
        detail: payload.detail,
      });
    }
    return new ObservatoryDataError(message, "BRIDGE_ERROR");
  }
}
