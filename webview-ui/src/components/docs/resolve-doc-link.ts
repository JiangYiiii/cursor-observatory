/**
 * 将 Markdown 内相对链接解析为文档根下的相对路径（POSIX）。
 * 返回 null 表示外链或无法安全解析。
 */
export function resolveDocLink(
  currentPath: string,
  href: string
): string | null {
  const t = href.trim();
  if (/^https?:\/\//i.test(t)) return null;
  const hashIdx = t.indexOf("#");
  const pathPart = hashIdx >= 0 ? t.slice(0, hashIdx) : t;
  const hash = hashIdx >= 0 ? t.slice(hashIdx) : "";
  if (pathPart === "" || pathPart === ".") {
    return currentPath + hash;
  }
  const curDir = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/"))
    : "";
  const parts = pathPart.split("/").filter(Boolean);
  let segs = curDir ? curDir.split("/").filter(Boolean) : [];
  for (const p of parts) {
    if (p === "..") {
      if (segs.length === 0) return null;
      segs.pop();
    } else if (p !== "." && p !== "") {
      segs.push(p);
    }
  }
  const out = segs.join("/");
  if (!out || out.includes("..")) return null;
  return out + hash;
}

export function stripHashForFetch(resolved: string): string {
  const i = resolved.indexOf("#");
  return i >= 0 ? resolved.slice(0, i) : resolved;
}
