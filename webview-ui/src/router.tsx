import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";

const Overview = lazy(() =>
  import("./views/Overview").then((m) => ({ default: m.Overview }))
);
const Architecture = lazy(() =>
  import("./views/Architecture").then((m) => ({ default: m.Architecture }))
);
const Capabilities = lazy(() =>
  import("./views/Capabilities").then((m) => ({ default: m.Capabilities }))
);
const DataModels = lazy(() =>
  import("./views/DataModels").then((m) => ({ default: m.DataModels }))
);
const Progress = lazy(() =>
  import("./views/Progress").then((m) => ({ default: m.Progress }))
);
const QualityMonitor = lazy(() =>
  import("./views/QualityMonitor").then((m) => ({
    default: m.QualityMonitor,
  }))
);
const AiSessions = lazy(() =>
  import("./views/AiSessions").then((m) => ({ default: m.AiSessions }))
);
const SessionManager = lazy(() =>
  import("./views/SessionManager").then((m) => ({
    default: m.SessionManager,
  }))
);
const DocsHealth = lazy(() =>
  import("./views/DocsHealth").then((m) => ({ default: m.DocsHealth }))
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/architecture" element={<Architecture />} />
        <Route path="/capabilities" element={<Capabilities />} />
        <Route path="/data-models" element={<DataModels />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/quality" element={<QualityMonitor />} />
        <Route path="/ai-sessions" element={<AiSessions />} />
        <Route path="/sessions" element={<SessionManager />} />
        <Route path="/docs-health" element={<DocsHealth />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
