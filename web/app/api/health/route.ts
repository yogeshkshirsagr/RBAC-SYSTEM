import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });

    return Response.json({ ok: true, database: "rbac_system" });
  } catch {
    return Response.json(
      { ok: false, error: "MongoDB is unavailable." },
      { status: 503 },
    );
  }
}
