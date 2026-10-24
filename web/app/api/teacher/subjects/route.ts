import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";

import { authorizePermission } from "@/lib/authorization";
import { normalizeSubjectName, recordAcademicAudit } from "@/lib/academics";
import { COLLECTIONS, type SubjectDocument } from "@/lib/db-types";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const authorization = await authorizePermission("update_marks");
  if (!authorization.ok) return authorization.response;

  try {
    const subjects = await (await getDatabase())
      .collection<SubjectDocument>(COLLECTIONS.subjects)
      .find({ teacherId: authorization.principal.user._id })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json(
      {
        ok: true,
        subjects: subjects.map((subject) => ({
          id: subject._id.toHexString(),
          name: subject.name,
          maxMarks: subject.maxMarks,
          createdAt: subject.createdAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Subjects are unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizePermission("update_marks");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "name" && key !== "maxMarks")) {
    return NextResponse.json({ ok: false, error: "Unexpected fields are not accepted." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  const normalizedName = normalizeSubjectName(name);
  const maxMarks = input.maxMarks === undefined ? 100 : input.maxMarks;
  if (name.length < 2 || name.length > 100) {
    return NextResponse.json({ ok: false, error: "Subject name must be between 2 and 100 characters." }, { status: 400 });
  }
  if (typeof maxMarks !== "number" || !Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1_000_000) {
    return NextResponse.json({ ok: false, error: "Maximum marks must be a positive number no greater than 1,000,000." }, { status: 400 });
  }

  const now = new Date();
  const subject: SubjectDocument = {
    teacherId: authorization.principal.user._id,
    name,
    normalizedName,
    maxMarks,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await (await getDatabase())
      .collection<SubjectDocument>(COLLECTIONS.subjects)
      .insertOne(subject);
    await recordAcademicAudit(
      authorization.principal.user._id,
      authorization.principal.user.username,
      "SUBJECT_CREATED",
      `Created subject '${name}'.`,
    );
    return NextResponse.json(
      { ok: true, subject: { id: result.insertedId.toHexString(), name, maxMarks, createdAt: now.toISOString() } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ ok: false, error: "A subject with this name already exists for your account." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Subject could not be created." }, { status: 503 });
  }
}
