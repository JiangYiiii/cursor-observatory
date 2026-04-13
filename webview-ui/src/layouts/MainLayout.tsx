import { Suspense } from "react";
import {
  Bot,
  Database,
  FileCheck,
  FolderOpen,
  GitBranch,
  Kanban,
  LayoutDashboard,
  Moon,
  Network,
  Rocket,
  Sun,
  TestTube2,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { ConnectionStatus, LoadingSkeleton } from "@/components/common";
import { ProjectSwitcher } from "@/components/common/ProjectSwitcher";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useWebviewClipboard } from "@/hooks/use-webview-clipboard";
import { useObservatoryStore } from "@/store/observatory-store";
import { useThemeStore } from "@/store/theme-store";

const nav = [
  { to: "/", label: "概览", icon: LayoutDashboard },
  { to: "/architecture", label: "架构", icon: Network },
  { to: "/capabilities", label: "需求", icon: Kanban },
  { to: "/data-models", label: "数据模型", icon: Database },
  { to: "/progress", label: "进度", icon: GitBranch },
  { to: "/quality", label: "质量", icon: TestTube2 },
  { to: "/ai-sessions", label: "AI 日志", icon: Bot },
  { to: "/sessions", label: "会话", icon: FolderOpen },
  { to: "/docs-health", label: "文档", icon: FileCheck },
  { to: "/release", label: "发布", icon: Rocket },
] as const;

export function MainLayout() {
  useThemeSync();
  useWebviewClipboard();
  const { theme, toggleTheme } = useThemeStore();
  const wsStatus = useObservatoryStore((s) => s.wsStatus);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-[#1e1e2e] dark:text-zinc-200">
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-700 dark:bg-[#252536]">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="text-sm font-semibold tracking-tight">Observatory</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Cursor 可观测
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                ].join(" ")
              }
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-200 p-2 text-xs text-zinc-500 dark:border-zinc-700">
          <ConnectionStatus status={wsStatus} className="mb-1" />
          <div>v0.1.1</div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-[#252536]/80">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
            <h1 className="shrink-0 text-lg font-medium">Dashboard</h1>
            <ProjectSwitcher />
          </div>
          <button
            type="button"
            onClick={() => toggleTheme()}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            aria-label={theme === "dark" ? "切换到亮色" : "切换到暗色"}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            {theme === "dark" ? "亮色" : "暗色"}
          </button>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <Suspense
              fallback={<LoadingSkeleton variant="card" lines={8} />}
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
