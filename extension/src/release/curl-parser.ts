export type ConfidenceLevel = "high" | "medium" | "low";

export interface ParsedCurlConfig {
  baseUrl?: string;
  namespace?: string;
  workspace?: string;
  cluster?: string;
  project?: string;
  operator?: string;
  cookieToken?: string;
  confidence: Record<string, ConfidenceLevel>;
  rawExtracted: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseCurlCommand(curl: string): ParsedCurlConfig {
  const normalized = preprocess(curl);
  const result: ParsedCurlConfig = {
    confidence: {},
    rawExtracted: {},
  };

  extractUrl(normalized, result);
  extractCookie(normalized, result);
  extractBody(normalized, result);
  crossValidateReferer(normalized, result);

  return result;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function mergeParsedConfigs(
  existing: ParsedCurlConfig,
  incoming: ParsedCurlConfig,
): ParsedCurlConfig {
  const merged: ParsedCurlConfig = {
    ...existing,
    confidence: { ...existing.confidence },
    rawExtracted: { ...existing.rawExtracted, ...incoming.rawExtracted },
  };

  const fields: Array<keyof Omit<ParsedCurlConfig, "confidence" | "rawExtracted">> = [
    "baseUrl",
    "namespace",
    "workspace",
    "cluster",
    "project",
    "operator",
    "cookieToken",
  ];

  const rank: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

  for (const field of fields) {
    const incomingVal = incoming[field];
    if (incomingVal == null) continue;

    const existingConf = rank[existing.confidence[field] ?? "low"];
    const incomingConf = rank[incoming.confidence[field] ?? "low"];

    if (existing[field] == null || incomingConf >= existingConf) {
      (merged as unknown as Record<string, unknown>)[field] = incomingVal;
      merged.confidence[field] = incoming.confidence[field] ?? "low";
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Step 1: preprocess
// ---------------------------------------------------------------------------

function preprocess(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\\\r?\n\s*/g, " ");
  s = s.replace(/\r\n/g, "\n");
  return s;
}

// ---------------------------------------------------------------------------
// Step 2: extract URL
// ---------------------------------------------------------------------------

function extractUrl(input: string, result: ParsedCurlConfig): void {
  const urlMatch = input.match(/curl\s+(?:-[ksSvXL]+\s+)*['"]?(https?:\/\/[^\s'"]+)['"]?/i);
  if (!urlMatch) return;

  const rawUrl = urlMatch[1];
  result.rawExtracted.url = rawUrl;

  try {
    const parsed = new URL(rawUrl);
    result.baseUrl = `${parsed.protocol}//${parsed.host}`;
    result.confidence.baseUrl = "high";
    result.rawExtracted.baseUrl = result.baseUrl;

    const path = parsed.pathname;

    const nsFromNamespaces = path.match(/\/namespaces\/([^/]+)/);
    if (nsFromNamespaces) {
      result.namespace = nsFromNamespaces[1];
      result.confidence.namespace = "high";
      result.rawExtracted.namespace = nsFromNamespaces[1];
    }

    const nsFromDevops = path.match(/\/devops\/([^/]+)/);
    if (nsFromDevops && !result.namespace) {
      result.namespace = nsFromDevops[1];
      result.confidence.namespace = "high";
      result.rawExtracted.devopsProject = nsFromDevops[1];
    } else if (nsFromDevops) {
      result.rawExtracted.devopsProject = nsFromDevops[1];
    }

    const wsFromPath = path.match(/\/workspaces\/([^/]+)/);
    if (wsFromPath) {
      const ws = wsFromPath[1];
      if (ws !== "default") {
        result.workspace = ws;
        result.confidence.workspace = "high";
      }
      result.rawExtracted.workspace = ws;
    }

    const envParam = parsed.searchParams.get("env");
    if (envParam) {
      result.cluster = envParam;
      result.confidence.cluster = "high";
      result.rawExtracted.cluster = envParam;
    }

    const clusterParam = parsed.searchParams.get("cluster");
    if (clusterParam && !result.cluster) {
      result.cluster = clusterParam;
      result.confidence.cluster = "high";
      result.rawExtracted.cluster = clusterParam;
    }
  } catch {
    // URL parse failed
  }
}

// ---------------------------------------------------------------------------
// Step 3: extract Cookie
// ---------------------------------------------------------------------------

function extractCookie(input: string, result: ParsedCurlConfig): void {
  let cookie: string | undefined;

  const bFlag = input.match(/-b\s+['"]([^'"]+)['"]/);
  if (bFlag) {
    cookie = bFlag[1];
  }

  if (!cookie) {
    const hCookie = input.match(/-H\s+['"][Cc]ookie:\s*([^'"]+)['"]/);
    if (hCookie) {
      cookie = hCookie[1];
    }
  }

  if (!cookie) return;

  result.cookieToken = cookie;
  result.confidence.cookieToken = "high";
  result.rawExtracted.cookieToken = `${cookie.slice(0, 20)}...`;

  const emailMatch = cookie.match(/YQG_EMAIL_PROD=([^;]+)/);
  if (emailMatch) {
    const email = decodeURIComponent(emailMatch[1]);
    const operator = email.includes("@") ? email.split("@")[0] : email;
    result.operator = operator;
    result.confidence.operator = "high";
    result.rawExtracted.operator = operator;
    result.rawExtracted.email = email;
  }
}

// ---------------------------------------------------------------------------
// Step 4: extract Body
// ---------------------------------------------------------------------------

function extractBody(input: string, result: ParsedCurlConfig): void {
  const bodyMatch = input.match(/(?:--data-raw|-d)\s+'([^']+)'/s)
    ?? input.match(/(?:--data-raw|-d)\s+"([^"]+)"/s);
  if (!bodyMatch) return;

  let bodyObj: Record<string, unknown>;
  try {
    bodyObj = JSON.parse(bodyMatch[1]);
  } catch {
    return;
  }

  result.rawExtracted.body = bodyMatch[1];

  if (typeof bodyObj.project === "string") {
    result.project = bodyObj.project;
    result.confidence.project = "medium";
    result.rawExtracted.project = bodyObj.project;
  }

  if (typeof bodyObj.module === "string") {
    result.rawExtracted.module = bodyObj.module;
  }

  if (typeof bodyObj.env === "string" && !result.cluster) {
    result.cluster = bodyObj.env;
    result.confidence.cluster = "medium";
    result.rawExtracted.cluster = bodyObj.env;
  }

  if (typeof bodyObj.devops === "string") {
    if (!result.namespace) {
      result.namespace = bodyObj.devops;
      result.confidence.namespace = "medium";
    }
    result.rawExtracted.devops = bodyObj.devops;
  }

  if (typeof bodyObj.devops_project === "string") {
    if (!result.namespace) {
      result.namespace = bodyObj.devops_project;
      result.confidence.namespace = "medium";
    }
    result.rawExtracted.devopsProject = bodyObj.devops_project;
  }

  if (typeof bodyObj.namespace === "string") {
    if (!result.workspace) {
      result.workspace = bodyObj.namespace;
      result.confidence.workspace = "medium";
    }
    result.rawExtracted.bodyNamespace = bodyObj.namespace;
  }

  if (typeof bodyObj.buildEnv === "string" && !result.cluster) {
    result.cluster = bodyObj.buildEnv;
    result.confidence.cluster = "medium";
    result.rawExtracted.cluster = bodyObj.buildEnv;
  }

  if (Array.isArray(bodyObj.parameters)) {
    for (const p of bodyObj.parameters as Array<{ name: string; value: string }>) {
      if (p.name === "PROJECT_NAME" && p.value) {
        result.project = p.value;
        result.confidence.project = "high";
        result.rawExtracted.project = p.value;
      }
      if (p.name === "MODULE_NAME" && p.value) {
        result.rawExtracted.fullModuleName = p.value;
      }
      if (p.name === "BUILD_ENV" && p.value && !result.cluster) {
        result.cluster = p.value;
        result.confidence.cluster = "high";
        result.rawExtracted.cluster = p.value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 5: cross-validate with Referer
// ---------------------------------------------------------------------------

function crossValidateReferer(input: string, result: ParsedCurlConfig): void {
  const refererMatch = input.match(/-H\s+['"][Rr]eferer:\s*(https?:\/\/[^\s'"]+)['"]/);
  if (!refererMatch) return;

  try {
    const refUrl = new URL(refererMatch[1]);
    const refPath = refUrl.pathname;

    result.rawExtracted.referer = refererMatch[1];

    const wsFromRef = refPath.match(/^\/([^/]+)\/clusters\//);
    if (wsFromRef) {
      const refWs = wsFromRef[1];
      if (!result.workspace && refWs !== "default") {
        result.workspace = refWs;
        result.confidence.workspace = "medium";
        result.rawExtracted.refererWorkspace = refWs;
      } else if (result.workspace && result.workspace !== refWs) {
        result.rawExtracted.refererWorkspaceConflict = refWs;
      }
    }

    const nsFromRef = refPath.match(/\/devops\/([^/]+)/);
    if (nsFromRef) {
      const refNs = nsFromRef[1];
      if (!result.namespace) {
        result.namespace = refNs;
        result.confidence.namespace = "medium";
        result.rawExtracted.refererNamespace = refNs;
      } else if (result.namespace !== refNs) {
        result.rawExtracted.refererNamespaceConflict = refNs;
      }
    }
  } catch {
    // Referer URL parse failed
  }
}
