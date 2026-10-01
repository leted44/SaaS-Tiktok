import { prisma } from "@/lib/prisma";
import { storageMigrationInfo } from "@/lib/storage";

/**
 * Pointing the database at R2 once the files have been copied there.
 *
 * Stored file URLs live in many places — plain columns (an asset's url, a
 * voiceover's audio) and JSON documents (a carousel's slides, a project's
 * visual layers, a render's props snapshot). Rather than a hand-kept list that
 * a future column would silently escape, every text and JSON column of the
 * schema is searched for the old bucket's URL prefix. The prefix is a full
 * https://… address of the old bucket, so nothing else can match it.
 */

export interface Column {
  table: string;
  column: string;
  json: "json" | "jsonb" | null;
}

export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function textColumns(): Promise<Column[]> {
  // Cast to text: information_schema's own types (sql_identifier…) are not ones every driver decodes.
  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name::text AS table_name, column_name::text AS column_name, data_type::text AS data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      AND table_name <> '_prisma_migrations'`;
  return rows.map((r) => ({ table: r.table_name, column: r.column_name, json: r.data_type === "json" || r.data_type === "jsonb" ? (r.data_type as "json" | "jsonb") : null }));
}

function prefixes(): { from: string; to: string }[] {
  const info = storageMigrationInfo();
  if (!info) return [];
  return info.legacyBases.map((base) => ({ from: `${base}/`, to: `${info.toBase}/` }));
}

/*
 * Each of these is one SQL statement, however many columns the schema has:
 * the database sits behind a pooler, often in another region, and a query
 * per column — over a hundred round trips — ran past a function's time limit.
 */

/** How many rows, per column, still link to a file of the old bucket. */
export async function countLegacyUrls(): Promise<{ total: number; columns: { name: string; rows: number }[] }> {
  const pairs = prefixes();
  const columns = pairs.length === 0 ? [] : await textColumns();
  if (columns.length === 0) return { total: 0, columns: [] };
  const params = pairs.map((p) => p.from);
  const sql = columns
    .map((c, i) => {
      const where = pairs.map((_, k) => `strpos(${ident(c.column)}::text, $${k + 1}) > 0`).join(" OR ");
      return `SELECT ${i} AS i, count(*)::int AS n FROM ${ident(c.table)} WHERE ${where}`;
    })
    .join(" UNION ALL ");
  const rows = await prisma.$queryRawUnsafe<{ i: number; n: number }[]>(sql, ...params);
  const found = rows.filter((r) => r.n > 0).map((r) => ({ name: `${columns[r.i].table}.${columns[r.i].column}`, rows: r.n }));
  return { total: found.reduce((sum, c) => sum + c.rows, 0), columns: found };
}

/**
 * Rewrite every link to the old bucket into the same file's R2 URL — one
 * UPDATE per table, all in a single statement, so it applies entirely or not
 * at all.
 */
export async function rewriteLegacyUrls(): Promise<number> {
  const pairs = prefixes();
  const columns = pairs.length === 0 ? [] : await textColumns();
  if (columns.length === 0) return 0;
  // $1 is the new prefix, $2… the old ones.
  const replaced = (expr: string) => pairs.reduce((acc, _, k) => `replace(${acc}, $${k + 2}, $1)`, expr);
  const byTable = new Map<string, Column[]>();
  for (const c of columns) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);
  const updates = [...byTable].map(([table, cols], i) => {
    const set = cols.map((c) => `${ident(c.column)} = ${c.json ? `${replaced(`${ident(c.column)}::text`)}::${c.json}` : replaced(ident(c.column))}`).join(", ");
    const where = cols.flatMap((c) => pairs.map((_, k) => `strpos(${ident(c.column)}::text, $${k + 2}) > 0`)).join(" OR ");
    return { name: `u${i}`, sql: `UPDATE ${ident(table)} SET ${set} WHERE ${where} RETURNING 1` };
  });
  const sql = `WITH ${updates.map((u) => `${u.name} AS (${u.sql})`).join(", ")} SELECT (${updates.map((u) => `(SELECT count(*) FROM ${u.name})`).join(" + ")})::int AS n`;
  const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(sql, pairs[0].to, ...pairs.map((p) => p.from));
  return row?.n ?? 0;
}
