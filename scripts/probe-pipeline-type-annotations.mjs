#!/usr/bin/env node
/**
 * 分页拉取 devops 下全部流水线，检查 metadata.annotations
 * `pipeline.devops.kubesphere.io/type` 是否存在及取值分布。
 *
 * 认证: CICD_COOKIE / CICD_BEARER / .cicd-cookie（与 probe-pipelines-image-tags.mjs 一致）
 *
 * 环境:
 *   CICD_BASE_URL   默认 https://cicd.fintopia.tech
 *   CICD_NAMESPACE  默认 cash-loanjqjjq
 *   CICD_PIPELINE_FILTER  默认空（不传 filter，拉全量）；与扩展默认 "prod" 不同，便于审计
 *   CICD_PIPELINE_PAGE_LIMIT 默认 100
 */

const TYPE_KEY = "pipeline.devops.kubesphere.io/type";

function parseItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
  return [];
}

async function fetchPage({ baseUrl, namespace, cookieHeader, bearer, page, limit, filter }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy: "name",
    ascending: "true",
  });
  if (filter) params.set("filter", filter);
  const path = `/kapis/devops.kubesphere.io/v1alpha3/devops/${encodeURIComponent(namespace)}/pipelines?${params}`;
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = {
    accept: "*/*",
    "content-type": "application/json",
  };
  if (cookieHeader) headers.cookie = cookieHeader;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return { url, status: res.status, ok: res.ok, body };
}

async function loadAuth() {
  let cookie = process.env.CICD_COOKIE || process.env.CICD_TOKEN || "";
  const bearer = process.env.CICD_BEARER || "";
  if (!cookie) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const p = path.join(process.cwd(), ".cicd-cookie");
      cookie = (await fs.readFile(p, "utf8")).trim();
    } catch {
      /* no file */
    }
  }
  return { cookie, bearer };
}

async function main() {
  const baseUrl = process.env.CICD_BASE_URL || "https://cicd.fintopia.tech";
  const namespace = process.env.CICD_NAMESPACE || "cash-loanjqjjq";
  const filter = process.env.CICD_PIPELINE_FILTER ?? "";
  const pageLimit = Number(process.env.CICD_PIPELINE_PAGE_LIMIT || "100", 10);

  const { cookie, bearer } = await loadAuth();
  if (!cookie && !bearer) {
    console.warn(
      "未配置 CICD_COOKIE / CICD_BEARER / .cicd-cookie：将匿名请求（若集群要求登录会返回 401）。\n",
    );
  }

  const rows = [];
  let page = 1;
  for (;;) {
    const r = await fetchPage({
      baseUrl,
      namespace,
      cookieHeader: cookie,
      bearer,
      page,
      limit: pageLimit,
      filter,
    });
    if (!r.ok) {
      console.error(`HTTP ${r.status} ${r.url}`);
      console.error(typeof r.body === "object" ? JSON.stringify(r.body).slice(0, 800) : r.body);
      process.exit(1);
    }
    const items = parseItems(r.body);
    for (const item of items) {
      const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const name = String(item.name ?? meta.name ?? "").trim();
      const ann = meta.annotations && typeof meta.annotations === "object" ? meta.annotations : {};
      const t = ann[TYPE_KEY];
      rows.push({
        name,
        type: typeof t === "string" ? t : t === undefined ? undefined : String(t),
        hasTypeKey: Object.prototype.hasOwnProperty.call(ann, TYPE_KEY),
      });
    }
    if (items.length < pageLimit) break;
    page += 1;
    if (page > 100) {
      console.error("分页超过 100 页，中止");
      process.exit(1);
    }
  }

  const missing = rows.filter((r) => !r.hasTypeKey);
  const empty = rows.filter((r) => r.hasTypeKey && (r.type === "" || r.type == null));
  const byType = new Map();
  for (const r of rows) {
    const k = r.type ?? "(无注解键)";
    byType.set(k, (byType.get(k) ?? 0) + 1);
  }

  console.log(`namespace=${namespace} filter=${filter || "(无)"} 共 ${rows.length} 条流水线\n`);
  console.log(`注解键 ${TYPE_KEY}:`);
  console.log(`  完全缺失: ${missing.length} 条`);
  console.log(`  键存在但值为空: ${empty.length} 条`);
  console.log("\n取值分布:");
  for (const [k, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${k}`);
  }

  if (missing.length) {
    console.log("\n缺失 type 注解的流水线名（前 50 条）:");
    for (const r of missing.slice(0, 50)) console.log(`  ${r.name}`);
    if (missing.length > 50) console.log(`  ... 另有 ${missing.length - 50} 条`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
