/** 列表/时间线中会话标题展示长度（与转录侧默认摘要对齐） */
const SESSION_TITLE_DISPLAY_MAX = 60;

/**
 * 会话展示名：优先已命名/已写入的 title；否则回退 id。
 * 过长时截断为前若干字符并加省略号。
 */
export function formatSessionDisplayTitle(
  title: string | undefined,
  fallbackId: string
): string {
  const raw =
    typeof title === "string" && title.trim().length > 0
      ? title.trim()
      : "";
  const base = raw.length > 0 ? raw : fallbackId;
  if (base.length <= SESSION_TITLE_DISPLAY_MAX) return base;
  return `${base.slice(0, SESSION_TITLE_DISPLAY_MAX)}…`;
}
