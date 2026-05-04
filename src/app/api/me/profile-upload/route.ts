import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const KIND_EXT: Record<string, string> = {
  avatar: "jpg",
  banner: "jpg",
  resume: "pdf",
  post: "jpg",
  poster: "jpg",
};

const ALLOWED: Record<string, string[]> = {
  avatar: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  banner: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  resume: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  post: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  poster: ["image/jpeg", "image/png", "image/webp"],
};

const MAX_BYTES: Record<string, number> = {
  avatar: 6 * 1024 * 1024,
  banner: 6 * 1024 * 1024,
  resume: 8 * 1024 * 1024,
  post: 8 * 1024 * 1024,
  poster: 2 * 1024 * 1024,
};

const KIND_PATH_PREFIX: Record<string, string> = {
  avatar: "",
  banner: "",
  resume: "",
  post: "posts/",
  poster: "posters/",
};

function humanizeStorageError(message: string): string {
  const m = message.trim();
  if (/bucket\s+not\s+found/i.test(m)) {
    return (
      'Storage bucket "profiles" does not exist on this Supabase project. ' +
      "Apply migrations (e.g. `npx supabase db push` after `supabase link`), " +
      "or run `supabase/migrations/20260503120000_profile_extension_storage.sql` in the Dashboard SQL editor."
    );
  }
  return m;
}

/** Multipart upload → Supabase `profiles` bucket + public URL. */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") || "resume");
  const kind =
    kindRaw === "avatar" ||
    kindRaw === "banner" ||
    kindRaw === "resume" ||
    kindRaw === "post" ||
    kindRaw === "poster"
      ? kindRaw
      : null;
  if (!kind) {
    return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const max = MAX_BYTES[kind];
  if (buf.length === 0 || buf.length > max) {
    return NextResponse.json({ ok: false, error: "Invalid file size" }, { status: 400 });
  }

  let contentType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpg") contentType = "image/jpeg";
  if (!ALLOWED[kind].includes(contentType)) {
    return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 400 });
  }

  const ext =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : contentType === "image/gif"
            ? "gif"
            : contentType === "application/pdf"
              ? "pdf"
              : KIND_EXT[kind];

  const path = `${user.id}/${KIND_PATH_PREFIX[kind]}${kind}-${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("profiles").upload(path, buf, {
    contentType,
    upsert: false,
  });

  if (upErr) {
    console.error("[profile-upload]", upErr);
    return NextResponse.json(
      { ok: false, error: humanizeStorageError(upErr.message) },
      { status: 500 },
    );
  }

  const { data } = supabase.storage.from("profiles").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, kind });
}
