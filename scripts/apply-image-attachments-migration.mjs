#!/usr/bin/env node
/**
 * Ensure atlas-image-attachments Storage bucket exists.
 * Table/RLS DDL cannot be applied via the JS client — print SQL path when missing.
 *
 * Usage (with env loaded):
 *   node scripts/apply-image-attachments-migration.mjs
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const BUCKET = "atlas-image-attachments";
const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buckets, error: listError } = await client.storage.listBuckets();
if (listError) {
  console.error("listBuckets failed:", listError.message);
  process.exit(1);
}

const exists = (buckets ?? []).some((b) => b.name === BUCKET);
if (!exists) {
  const { error } = await client.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  });
  if (error) {
    console.error("createBucket failed:", error.message);
    process.exit(1);
  }
  console.log(`Created private bucket: ${BUCKET}`);
} else {
  console.log(`Bucket already exists: ${BUCKET}`);
}

const { error: tableError } = await client
  .from("atlas_image_attachments")
  .select("id")
  .limit(1);

if (!tableError) {
  console.log("Table atlas_image_attachments: OK");
  process.exit(0);
}

console.error("Table probe failed:", tableError.message);
console.error(
  "Apply SQL manually in Supabase SQL editor:",
  "supabase/migrations/20260726_atlas_image_attachments.sql",
);
try {
  const sqlPath = resolve(
    process.cwd(),
    "supabase/migrations/20260726_atlas_image_attachments.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");
  console.error("--- SQL BEGIN ---");
  console.error(sql);
  console.error("--- SQL END ---");
} catch {
  /* ignore */
}
process.exit(2);
