/** 中文区域格式时间（短） */
export function formatDateTimeZh(iso?: string | null): string {
  if (!iso) return "时间未知";
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return "时间未知";
  return new Date(t).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 较长格式，含年 */
export function formatDateTimeZhFull(iso?: string | null): string {
  if (!iso) return "时间未知";
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return "时间未知";
  return new Date(t).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
