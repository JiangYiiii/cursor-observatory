import { useEffect } from "react";
import { AppRoutes } from "./router";
import { useObservatoryStore } from "./store/observatory-store";

export default function App() {
  const loadAll = useObservatoryStore((s) => s.loadAll);
  const disposeLive = useObservatoryStore((s) => s.disposeLive);

  useEffect(() => {
    void loadAll();
    return () => disposeLive();
  }, [loadAll, disposeLive]);

  return <AppRoutes />;
}
