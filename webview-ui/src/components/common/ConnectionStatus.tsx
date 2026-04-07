import { Radio, WifiOff } from "lucide-react";
import type { WsConnectionStatus } from "@/store/observatory-store";

const labels: Record<WsConnectionStatus, string> = {
  idle: "实时：未连接",
  connecting: "实时：连接中",
  connected: "实时：已连接",
  disconnected: "实时：已断开",
  error: "实时：连接异常",
};

type Props = {
  status: WsConnectionStatus;
  className?: string;
};

export function ConnectionStatus({ status, className = "" }: Props) {
  const showWifi = status === "connected" || status === "connecting";
  const Icon = showWifi ? Radio : WifiOff;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 ${className}`}
      title={labels[status]}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={2} />
      <span>{labels[status]}</span>
    </span>
  );
}
