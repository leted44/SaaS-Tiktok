import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { searchStock, stockCandidates, StockError } from "@/lib/stock/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const batchSchema = z.object({
  queries: z.array(z.string().max(120)).min(1).max(30),
  type: z.enum(["video", "image"]).default("video"),
});

function errorResponse(err: unknown) {
  if (err instanceof StockError) return NextResponse.json({ error: err.message }, { status: err.code === "NOT_CONFIGURED" ? 503 : 502 });
  return NextResponse.json({ error: err instanceof Error ? err.message : "Recherche impossible" }, { status: 502 });
}

/** Browse stock media for one scene. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ error: "Requête vide" }, { status: 400 });
  const type = searchParams.get("type") === "image" ? "image" : "video";

  try {
    return NextResponse.json({ results: await searchStock(query, type) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Candidates per scene query, for filling a whole video in a single click. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    // Deep enough that regenerating a scene the user rejected still has options.
    const matches = await Promise.all(parsed.data.queries.map((q) => (q.trim() ? stockCandidates(q, parsed.data.type, 8) : Promise.resolve([]))));
    return NextResponse.json({ matches });
  } catch (err) {
    return errorResponse(err);
  }
}
