#!/usr/bin/env node
/**
 * 1) 拉取 devops 流水线列表（与扩展 listPipelines 同源）
 * 2) 解析出唯一短 repoName（与 parsePipelineName 一致）
 * 3) 对每个 repoName 探测 image/tags：短名 vs cn-cashloan- 前缀
 *
 * 认证（任选其一）:
 *   export CICD_COOKIE='浏览器 Cookie'
 *   export CICD_BEARER='...'
 *   或: echo -n 'cookie' > .cicd-cookie   （已加入 .gitignore）
 *
 * 用法:
 *   node scripts/probe-pipelines-image-tags.mjs
 *   node scripts/probe-pipelines-image-tags.mjs --only cash-loan-repay-api,cash-loan-repay-service
 */

const PREFIX = "cn-cashloan-";

function parsePipelineName(name) {
  let pipelineType = "unknown";
  let moduleName = name;
  let hasCanary = false;
  if (name.endsWith("-cd-canary")) {
    pipelineType = "canary";
    hasCanary = true;
    moduleName = name.slice(0, -"-cd-canary".length);
  } else if (name.endsWith("-cd-prod")) {
    pipelineType = "prod";
    moduleName = name.slice(0, -"-cd-prod".length);
  }
  const repoName = moduleName.replace(/^cn-cashloan-/, "");
  return { moduleName, repoName, pipelineType, hasCanary };
}

function variantsForProbe(logicalName) {
  const t = String(logicalName).trim();
  if (!t) return [];
  const out = new Set();
  out.add(t);
  if (!t.startsWith(PREFIX)) out.add(`${PREFIX}${t}`);
  else out.add(t.slice(PREFIX.length));
  return [...out];
}

function parseItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
  return [];
}

async function fetchPipelines({ baseUrl, namespace, cookieHeader, bearer, page, limit, filter }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    filter,
    sortBy: "name",
    ascending: "true",
  });
  const path = `/kapis/devops.kubesphere.io/v1alpha3/devops/${encodeURIComponent(
    namespace,
  )}/pipelines?${params}`;
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
    body = { _raw: text.slice(0, 300) };
  }
  return { url, status: res.status, ok: res.ok, body };
}

async function fetchTags({ baseUrl, namespace, env, repoName, cookieHeader, bearer, imageFilter }) {
  const params = new URLSearchParams({
    repoName,
    env,
    imageFilter,
    searchFilter: "",
  });
  const path = `/kapis/cicd.kubesphere.io/v1alpha4/namespaces/${encodeURIComponent(
    namespace,
  )}/image/tags?${params}`;
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
    body = null;
  }
  const items = parseItems(body);
  const tags = items
    .map((it) => (typeof it === "object" && it ? it.tag ?? it.name : String(it)))
    .filter(Boolean);
  return { status: res.status, count: tags.length, sample: tags[0] ?? null };
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
  const env = process.env.CICD_ENV || "prod";
  const imageFilter = process.env.CICD_IMAGE_FILTER || "release*";
  const filter = process.env.CICD_PIPELINE_FILTER || "prod";
  const pageLimit = Number(process.env.CICD_PIPELINE_PAGE_LIMIT || "100", 10);

  let onlySet = null;
  const onlyIdx = process.argv.indexOf("--only");
  if (onlyIdx >= 0 && process.argv[onlyIdx + 1]) {
    onlySet = new Set(
      process.argv[onlyIdx + 1]
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  const { cookie, bearer } = await loadAuth();
  if (!cookie && !bearer) {
    console.warn(
      "未设置 CICD_COOKIE / CICD_BEARER / .cicd-cookie：将以无认证请求；若返回 401 请配置 Cookie。\n",
    );
  }

  const allNames = [];
  let page = 1;
  for (;;) {
    const r = await fetchPipelines({
      baseUrl,
      namespace,
      cookieHeader: cookie,
      bearer,
      page,
      limit: pageLimit,
      filter,
    });
    if (!r.ok) {
      console.error(`流水线列表失败 HTTP ${r.status} ${r.url}`);
      console.error(typeof r.body === "object" ? JSON.stringify(r.body).slice(0, 500) : r.body);
      process.exit(1);
    }
    const items = parseItems(r.body);
    for (const item of items) {
      const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const name = String(item.name ?? meta.name ?? "").trim();
      if (name) allNames.push(name);
    }
    if (items.length < pageLimit) break;
    page += 1;
    if (page > 50) {
      console.error("分页超过 50 页，中止（防死循环）");
      process.exit(1);
    }
  }

  const repoSet = new Map();
  for (const name of allNames) {
    const { repoName } = parsePipelineName(name);
    if (!repoSet.has(repoName)) repoSet.set(repoName, []);
    repoSet.get(repoName).push(name);
  }

  let repos = [...repoSet.keys()].sort();
  if (onlySet) {
    repos = repos.filter((r) => onlySet.has(r));
  }

  console.log(
    `流水线 ${allNames.length} 条，唯一 repoName ${repoSet.size} 个` +
      (onlySet ? `（仅探测 ${repos.length} 个）` : "") +
      `\nbaseUrl=${baseUrl} namespace=${namespace} env=${env} imageFilter=${imageFilter}\n`,
  );

  const rows = [];
  for (const logical of repos) {
    for (const repoName of variantsForProbe(logical)) {
      try {
        const t = await fetchTags({
          baseUrl,
          namespace,
          env,
          repoName,
          cookieHeader: cookie,
          bearer,
          imageFilter,
        });
        rows.push({
          logical,
          repoName,
          status: t.status,
          count: t.count,
          sample: t.sample,
          works: t.status === 200 && t.count > 0,
        });
      } catch (e) {
        rows.push({
          logical,
          repoName,
          status: "ERR",
          count: 0,
          sample: String(e?.message ?? e),
          works: false,
        });
      }
    }
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad("logical(repo)", 30) +
      pad("repoName(query)", 44) +
      pad("http", 6) +
      pad("count", 6) +
      "ok? sample",
  );
  console.log("-".repeat(125));

  for (const row of rows) {
    const mark = row.works ? "Y" : "n";
    const sample = row.sample ? String(row.sample).slice(0, 52) : "";
    console.log(
      pad(row.logical, 30) +
        pad(row.repoName, 44) +
        pad(row.status, 6) +
        pad(row.count, 6) +
        `${mark}  ${sample}`,
    );
  }

  console.log("\n=== 汇总：每个 logical 应使用的 repoName（能拿到 tag 的变体；若两条都行取条数多者）===\n");
  for (const logical of repos) {
    const candidates = rows.filter((r) => r.logical === logical && r.works);
    if (candidates.length === 0) {
      console.log(`${logical}: 无（两变体均无 tag，或 HTTP 非 200）`);
    } else {
      const best = candidates.sort((a, b) => b.count - a.count)[0];
      const shortName = logical;
      const fullName = shortName.startsWith(PREFIX) ? shortName : `${PREFIX}${shortName}`;
      const recommendation =
        best.repoName === shortName
          ? "仅短名"
          : best.repoName === fullName
            ? "仅 cn-cashloan- 前缀"
            : `其它: ${best.repoName}`;
      console.log(`${logical}: 推荐 repoName=${best.repoName} (${best.count} 条) → ${recommendation}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
