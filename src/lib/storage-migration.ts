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
  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      AND table_name <> '_prisma_migrations'`;
  return rows.map((r) => ({ table: r.table_name, column: r.column_name, json: r.data_type === "json" || r.data_type === "jsonb" ? r.data_type : null }));
}

function prefixes(): { from: string; to: string }[] {
  const info = storageMigrationInfo();
  if (!info) return [];
  return info.legacyBases.map((base) => ({ from: `${base}/`, to: `${info.toBase}/` }));
}

/** How many rows, per column, still link to a file of the old bucket. */
export async function countLegacyUrls(): Promise<{ total: number; columns: { name: string; rows: number }[] }> {
  const pairs = prefixes();
  if (pairs.length === 0) return { total: 0, columns: [] };
  const columns: { name: string; rows: number }[] = [];
  for (const c of await textColumns()) {
    const where = pairs.map((_, i) => `strpos(${ident(c.column)}::text, $${i + 1}) > 0`).join(" OR ");
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${ident(c.table)} WHERE ${where}`, ...pairs.map((p) => p.from));
    const rows = Number(row?.n ?? 0);
    if (rows > 0) columns.push({ name: `${c.table}.${c.column}`, rows });
  }
  return { total: columns.reduce((sum, c) => sum + c.rows, 0), columns };
}

/** Rewrite every link to the old bucket into the same file's R2 URL, in one transaction. */
export async function rewriteLegacyUrls(): Promise<number> {
  const pairs = prefixes();
  if (pairs.length === 0) return 0;
  const columns = await textColumns();
  const statements = columns.flatMap((c) =>
    pairs.map((p) => {
      const col = ident(c.column);
      const value = c.json ? `replace(${col}::text, $1, $2)::${c.json}` : `replace(${col}, $1, $2)`;
      return prisma.$executeRawUnsafe(`UPDATE ${ident(c.table)} SET ${col} = ${value} WHERE strpos(${col}::text, $1) > 0`, p.from, p.to);
    }),
  );
  const counts = await prisma.$transaction(statements);
  return counts.reduce((sum, n) => sum + n, 0);
}
