interface StatusBadgeProps {
  status: string;
  label?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; animate?: boolean }> = {
  succeeded: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  SUCCESS: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },

  running: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", animate: true },
  IN_PROGRESS: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", animate: true },
  deploying: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", animate: true },

  paused: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  PAUSED: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  UNKNOWN: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  waiting_release: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  waiting_gray_confirm: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400" },
  waiting_bluegreen_switch: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400" },
  waiting_manual: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" },

  failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },

  idle: { bg: "bg-zinc-100 dark:bg-zinc-700/40", text: "text-zinc-500 dark:text-zinc-400" },
  NOT_BUILT: { bg: "bg-zinc-100 dark:bg-zinc-700/40", text: "text-zinc-500 dark:text-zinc-400" },
  aborted: { bg: "bg-zinc-100 dark:bg-zinc-700/40", text: "text-zinc-500 dark:text-zinc-400" },
  ABORTED: { bg: "bg-zinc-100 dark:bg-zinc-700/40", text: "text-zinc-500 dark:text-zinc-400" },
  unknown: { bg: "bg-zinc-100 dark:bg-zinc-700/40", text: "text-zinc-500 dark:text-zinc-400" },
};

const DISPLAY_LABELS: Record<string, string> = {
  succeeded: "成功",
  SUCCESS: "成功",
  running: "运行中",
  IN_PROGRESS: "运行中",
  deploying: "部署中",
  paused: "等待中",
  PAUSED: "等待中",
  UNKNOWN: "等待中",
  waiting_release: "待发布单确认",
  waiting_gray_confirm: "待灰度确认",
  waiting_bluegreen_switch: "待蓝绿切流",
  waiting_manual: "待人工确认",
  failed: "失败",
  FAILED: "失败",
  idle: "空闲",
  NOT_BUILT: "未构建",
  aborted: "已中止",
  ABORTED: "已中止",
  unknown: "未知",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown!;
  const displayLabel = label ?? DISPLAY_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
    >
      {style.animate && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {displayLabel}
    </span>
  );
}
