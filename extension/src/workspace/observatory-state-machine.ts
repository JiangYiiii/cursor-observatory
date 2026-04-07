/**
 * Extension 侧生命周期状态（与 docs/ARCHITECTURE.md §十 一致）。
 * primary_doc: docs/ARCHITECTURE.md §十
 */
export type ObservatoryRunState =
  | "INITIALIZING"
  | "READY"
  | "SCANNING"
  | "RECOVERING"
  | "DEGRADED";

export class ObservatoryStateMachine {
  private phase: ObservatoryRunState = "INITIALIZING";
  private readonly listeners = new Set<(s: ObservatoryRunState) => void>();

  getPhase(): ObservatoryRunState {
    return this.phase;
  }

  subscribe(fn: (s: ObservatoryRunState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(next: ObservatoryRunState): void {
    if (this.phase === next) return;
    this.phase = next;
    for (const fn of this.listeners) fn(next);
  }

  beginInitializing(): void {
    this.emit("INITIALIZING");
  }

  markReady(): void {
    this.emit("READY");
  }

  beginScanning(): void {
    this.emit("SCANNING");
  }

  beginRecovering(): void {
    this.emit("RECOVERING");
  }

  markDegraded(): void {
    this.emit("DEGRADED");
  }
}
