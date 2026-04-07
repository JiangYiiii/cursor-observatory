/**
 * 从 data-models 生成 Mermaid erDiagram 源码。
 * primary_doc: docs/SCHEMA_SPEC.md §十, docs/FRONTEND_DESIGN.md §4.4
 */
import type {
  DataModelRelationship,
  DataModelTable,
} from "@/types/observatory";

/** 用于列表/选中的稳定键 */
export function tableKey(t: DataModelTable): string {
  if (t.schema && t.schema !== "public") {
    return `${t.schema}.${t.name}`;
  }
  return t.name;
}

/** 库/schema 分组：缺省与 public 归为 default，供下拉筛选 */
export function schemaGroupKey(t: DataModelTable): string {
  const s = t.schema;
  if (!s || s === "public") return "default";
  return s;
}

export function resolveKeyInTables(
  tables: DataModelTable[],
  tableRef: string
): string | undefined {
  for (const t of tables) {
    if (tableKey(t) === tableRef || t.name === tableRef) return tableKey(t);
  }
  return undefined;
}

export type CollectNeighborOptions = {
  /** BFS 深度，0 表示仅中心表 */
  maxDepth: number;
  maxNodes: number;
};

/**
 * 以 centerKey 为起点在关系图上 BFS，返回不超过 maxDepth、maxNodes 的表键列表（稳定顺序为 BFS 序）。
 * centerKey 为空或不在 tables 中时，退回第一张表；tables 为空时返回 []。
 */
export function collectNeighborTableKeys(
  centerKey: string | null,
  tables: DataModelTable[],
  relationships: DataModelRelationship[],
  opts: CollectNeighborOptions
): string[] {
  if (!tables.length) return [];

  const keySet = new Set(tables.map((t) => tableKey(t)));
  const start =
    centerKey != null && keySet.has(centerKey)
      ? centerKey
      : tableKey(tables[0]!);

  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!keySet.has(a) || !keySet.has(b) || a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const r of relationships) {
    const a = resolveKeyInTables(tables, r.from_table);
    const b = resolveKeyInTables(tables, r.to_table);
    if (a && b) addEdge(a, b);
  }

  const visited = new Set<string>();
  const result: string[] = [];
  const q: { k: string; d: number }[] = [{ k: start, d: 0 }];

  while (q.length > 0 && result.length < opts.maxNodes) {
    const { k, d } = q.shift()!;
    if (visited.has(k)) continue;
    visited.add(k);
    if (d > opts.maxDepth) continue;
    result.push(k);
    if (result.length >= opts.maxNodes) break;
    for (const nb of adj.get(k) ?? []) {
      if (!visited.has(nb)) {
        q.push({ k: nb, d: d + 1 });
      }
    }
  }

  return result;
}

/** 仅保留两端表均落在当前表集合内的关系 */
export function filterRelationshipsForTables(
  tables: DataModelTable[],
  relationships: DataModelRelationship[] | undefined
): DataModelRelationship[] {
  if (!relationships?.length) return [];
  return relationships.filter((r) => {
    const fromK = resolveKeyInTables(tables, r.from_table);
    const toK = resolveKeyInTables(tables, r.to_table);
    return fromK != null && toK != null;
  });
}

function entityId(key: string): string {
  const raw = key.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(raw) ? `tbl_${raw}` : raw;
}

function sqlTypeToMermaid(type: string | undefined): string {
  if (!type) return "string";
  const u = type.toUpperCase();
  if (u.includes("BIGINT")) return "bigint";
  if (
    u.includes("INT") ||
    u.includes("SERIAL") ||
    u.includes("SMALLINT") ||
    u.includes("TINYINT")
  ) {
    return "int";
  }
  if (u.includes("BOOL")) return "boolean";
  if (
    u.includes("FLOAT") ||
    u.includes("DOUBLE") ||
    u.includes("DECIMAL") ||
    u.includes("NUMERIC") ||
    u.includes("REAL")
  ) {
    return "float";
  }
  if (
    u.includes("TIMESTAMP") ||
    u.includes("DATETIME") ||
    u.includes("DATE") ||
    u.includes("TIME")
  ) {
    return "datetime";
  }
  return "string";
}

function sanitizeColName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return s.length ? s : "col";
}

function relLine(type: string | undefined): string {
  switch (type) {
    case "one_to_one":
      return "||--||";
    case "one_to_many":
      return "||--o{";
    case "many_to_many":
      return "}o--o{";
    case "many_to_one":
    default:
      return "}o--||";
  }
}

function resolveEntityId(
  tables: DataModelTable[],
  keyByTable: Map<string, string>,
  tableRef: string
): string | undefined {
  if (keyByTable.has(tableRef)) {
    return keyByTable.get(tableRef);
  }
  const t = tables.find((x) => x.name === tableRef);
  if (!t) return undefined;
  return keyByTable.get(tableKey(t));
}

export type BuildErMermaidOptions = {
  /** 为真时实体不输出列，仅保留占位，显著减小 Mermaid 文本体积 */
  compact?: boolean;
};

/**
 * 生成 Mermaid erDiagram 文本；表为空时返回空字符串。
 */
export function buildErMermaid(
  tables: DataModelTable[],
  relationships: DataModelRelationship[] | undefined,
  options?: BuildErMermaidOptions
): string {
  if (!tables.length) return "";
  const compact = options?.compact === true;

  const lines: string[] = ["erDiagram"];
  const keyByTable = new Map<string, string>();

  for (const t of tables) {
    const k = tableKey(t);
    keyByTable.set(k, entityId(k));
  }

  for (const t of tables) {
    const k = tableKey(t);
    const eid = keyByTable.get(k)!;
    lines.push(`  ${eid} {`);
    if (compact) {
      lines.push(`    string _`);
    } else {
      const cols = t.columns;
      if (cols && cols.length > 0) {
        for (const col of cols) {
          const st = sqlTypeToMermaid(col.type);
          const cn = sanitizeColName(col.name);
          const pk = col.primary_key ? " PK" : "";
          lines.push(`    ${st} ${cn}${pk}`);
        }
      } else {
        lines.push(`    string _`);
      }
    }
    lines.push("  }");
  }

  const rels = relationships ?? [];
  for (const r of rels) {
    const fromId = resolveEntityId(tables, keyByTable, r.from_table);
    const toId = resolveEntityId(tables, keyByTable, r.to_table);
    if (!fromId || !toId || fromId === toId) continue;
    const arrow = relLine(r.type);
    const label = `"${r.from_column}"`;
    lines.push(`  ${fromId} ${arrow} ${toId} : ${label}`);
  }

  return lines.join("\n");
}
