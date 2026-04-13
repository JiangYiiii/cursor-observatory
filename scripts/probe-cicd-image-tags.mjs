#!/usr/bin/env node
/**
 * 探测 KubeSphere CICD image/tags 在不同 repoName 写法下的返回情况。
 *
 * 用法:
 *   export CICD_COOKIE='cookie 字符串'   # 与浏览器 DevTools 里该域下的 Cookie 一致（推荐）
 *   # 或仅 Bearer（若你们网关支持）:
 *   export CICD_BEARER='xxxxxxxx'
 *   # 可选:
 *   export CICD_BASE_URL='https://cicd.fintopia.tech'
 *   export CICD_NAMESPACE='cash-loanjqjjq'
 *   export CICD_ENV='prod'
 *
 *   node scripts/probe-cicd-image-tags.mjs cash-loan-repay-api cash-loan-repay-service cash-loan-funding-api
 *
 * 说明:
 * - 对每个「逻辑仓库名」会尝试多种 repoName 变体（原样 / 加 cn-cashloan- / 去前缀等），
 *   以 HTTP 200 且 tag 条数 > 0 为「能获取到」。
 * - 不要把 token/cookie 写进命令行历史；用环境变量或 .env（勿提交 git）。
 */

const PREFIX = "cn-cashloan-";

function variantsForProbe(logicalName) {
  const t = String(logicalName).trim();
  if (!t) return [];
  const out = new Set();
  out.add(t);
  if (!t.startsWith(PREFIX)) {
    out.add(`${PREFIX}${t}`);
  } else {
    out.add(t.slice(PREFIX.length));
  }
  return [...out];
}

function parseItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
  return [];
}

async function fetchTags({
  baseUrl,
  namespace,
  env,
  repoName,
  cookieHeader,
  bearer,
  imageFilter,
}) {
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

  /** @type {Record<string, string>} */
  const headers = {
    accept: "*/*",
    "content-type": "application/json",
  };
  if (cookieHeader) headers.cookie = cookieHeader;
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 500) };
  }

  const items = parseItems(body);
  const tags = items
    .map((it) => (typeof it === "object" && it ? it.tag ?? it.name : String(it)))
    .filter(Boolean);

  return {
    url,
    status: res.status,
    ok: res.ok,
    count: tags.length,
    sample: tags[0] ?? null,
  };
}

async function main() {
  const baseUrl = process.env.CICD_BASE_URL || "https://cicd.fintopia.tech";
  const namespace = process.env.CICD_NAMESPACE || "cash-loanjqjjq";
  const env = process.env.CICD_ENV || "prod";
  const imageFilter = process.env.CICD_IMAGE_FILTER || "release*";

  const cookie = process.env.CICD_COOKIE || process.env.CICD_TOKEN || "";
  const bearer = process.env.CICD_BEARER || "";

  const argvRepos = process.argv.slice(2).filter(Boolean);
  const repos =
    argvRepos.length > 0
      ? argvRepos
      : (process.env.CICD_PROBE_REPOS || "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);

  if (!cookie && !bearer) {
    console.error(
      "请设置 CICD_COOKIE（推荐，与控制台一致）或 CICD_BEARER。",
    );
    process.exit(1);
  }

  if (repos.length === 0) {
    console.error(
      "请传入仓库逻辑名，例如:\n  node scripts/probe-cicd-image-tags.mjs cash-loan-repay-api cash-loan-repay-service\n或设置 CICD_PROBE_REPOS='a,b,c'",
    );
    process.exit(1);
  }

  console.log(`baseUrl=${baseUrl} namespace=${namespace} env=${env} imageFilter=${imageFilter}\n`);

  const rows = [];

  for (const logical of repos) {
    const vars = variantsForProbe(logical);
    for (const repoName of vars) {
      try {
        const r = await fetchTags({
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
          status: r.status,
          count: r.count,
          sample: r.sample,
          works: r.status === 200 && r.count > 0,
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
    pad("logical", 28) +
      pad("repoName(query)", 42) +
      pad("http", 6) +
      pad("count", 6) +
      "works  sample",
  );
  console.log("-".repeat(120));

  for (const row of rows) {
    const mark = row.works ? "YES" : "no";
    const sample = row.sample ? String(row.sample).slice(0, 56) : "";
    console.log(
      pad(row.logical, 28) +
        pad(row.repoName, 42) +
        pad(row.status, 6) +
        pad(row.count, 6) +
        `${mark}     ${sample}`,
    );
  }

  console.log("\n--- 汇总（每个 logical 优先列出能拿到结果的 repoName）---\n");
  for (const logical of repos) {
    const candidates = rows.filter((r) => r.logical === logical && r.works);
    if (candidates.length === 0) {
      console.log(`${logical}: 无任一变体返回 tag（请检查 namespace/env/cookie 或仓库是否无 release* 镜像）`);
    } else {
      const best = candidates.sort((a, b) => b.count - a.count)[0];
      console.log(`${logical}: 使用 repoName=${best.repoName} （${best.count} 条，示例 tag: ${best.sample ?? "?"})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
