import { useReleaseStore } from "@/store/release-store";
import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";

export function EnvStatusBanner() {
  const envStatus = useReleaseStore((s) => s.envStatus);
  const loading = useReleaseStore((s) => s.loading.envStatus);
  const error = useReleaseStore((s) => s.errors.envStatus);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在检查环境配置…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        <XCircle className="h-4 w-4 shrink-0" />
        环境检查失败: {error.message}
      </div>
    );
  }

  if (!envStatus) {
    return null;
  }

  if (envStatus.tokenSet && envStatus.tokenValid) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            Token 已配置 · {envStatus.devopsProject} · {envStatus.cluster}
            {envStatus.operator && ` · 操作人: ${envStatus.operator}`}
          </span>
        </div>
        {envStatus.issues.length > 0 && (
          <IssuesList issues={envStatus.issues} />
        )}
      </div>
    );
  }

  if (!envStatus.tokenSet) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0" />
          Token 未配置，请运行 &lsquo;Observatory: Set CICD Token&rsquo; 或使用 curl 导入
        </div>
        {envStatus.issues.length > 0 && (
          <IssuesList issues={envStatus.issues} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Token 已过期，请重新配置
      </div>
      {envStatus.issues.length > 0 && (
        <IssuesList issues={envStatus.issues} />
      )}
    </div>
  );
}

function IssuesList({ issues }: { issues: string[] }) {
  return (
    <ul className="space-y-0.5 pl-6 text-[10px] text-amber-700 dark:text-amber-400">
      {issues.map((issue, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {issue}
        </li>
      ))}
    </ul>
  );
}
