/**
 * 侧栏能力列表（来自 capabilities.json）。
 * primary_doc: docs/EXTENSION_DESIGN.md §3.1
 */
import * as vscode from "vscode";
import type { ObservatoryStore } from "../observatory/store";

export class CapabilityItem extends vscode.TreeItem {
  constructor(
    public readonly capId: string,
    label: string,
    tooltip?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip ?? label;
    this.contextValue = "capability";
  }
}

export class CapabilityTreeProvider
  implements vscode.TreeDataProvider<CapabilityItem>
{
  private readonly _onDidChange = new vscode.EventEmitter<
    CapabilityItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(
    private readonly getWorkspaceRoot: () => string | undefined,
    private readonly getStore: (root: string) => ObservatoryStore | undefined
  ) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: CapabilityItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: CapabilityItem
  ): vscode.ProviderResult<CapabilityItem[]> {
    if (element) {
      return [];
    }
    const root = this.getWorkspaceRoot();
    if (!root) {
      return [];
    }
    const store = this.getStore(root);
    if (!store) {
      return [];
    }
    return store.readCapabilities().then((caps) => {
      const raw = caps.capabilities ?? [];
      return raw.map((c) => {
        const row = c as Record<string, unknown>;
        const id = String(row.id ?? row.title ?? "capability");
        const label = String(row.title ?? row.id ?? "Capability");
        const tip =
          typeof row.description === "string" ? row.description : undefined;
        return new CapabilityItem(id, label, tip);
      });
    });
  }
}
