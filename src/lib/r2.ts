import "server-only";
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** DB stores keys like `clips/abc123.mp4`, never public URLs (PHASE_1 storage rules). */
export const CLIP_KEY_PREFIX = "clips/";
export const GROUP_PHOTO_KEY_PREFIX = "groups/";
export const MESSAGE_MEDIA_KEY_PREFIX = "messages/";
export const ORG_ASSET_KEY_PREFIX = "orgs/";

const DEFAULT_SIGN_EXPIRES_SEC = 300;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let cachedClient: S3Client | undefined;

/** S3-compatible client pointed at Cloudflare R2. Server-only — keys never touch the browser bundle. */
export function getR2S3Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim(),
  );
}

/**
 * Options shared by every presigned PUT signer.
 *
 * `contentLength` is REQUIRED and is bound into the signature: SigV4 signs the
 * `content-length` header (it is not in @smithy/signature-v4's unsignable set),
 * so R2 rejects with 403 any PUT whose actual body length differs from the
 * value signed here. The browser sets Content-Length automatically from the
 * body, so callers just need to upload exactly the bytes they declared.
 *
 * Note: the presigner deliberately marks `content-type` as unsignable, so the
 * Content-Type passed here is a default for the stored object, not an
 * enforced constraint on the upload.
 */
type PutSignOptions = {
  /** Exact byte length of the upload body. Must be a positive safe integer. */
  contentLength: number;
  contentType?: string;
  expiresInSec?: number;
};

/** Throws unless `contentLength` is a positive safe integer — never sign an unbounded PUT. */
function assertPutContentLength(contentLength: number): void {
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error(
      "Presigned PUT contentLength must be a positive safe integer (bytes)",
    );
  }
}

function assertClipObjectKey(objectKey: string): void {
  const key = objectKey.trim();
  if (!key || key.includes("://")) {
    throw new Error(
      "Clip storage keys must be object keys (e.g. clips/id.mp4), not URLs",
    );
  }
  if (!key.startsWith(CLIP_KEY_PREFIX)) {
    throw new Error(`Clip object keys must start with "${CLIP_KEY_PREFIX}"`);
  }
}

/**
 * Short-lived signed PUT for uploading a Clip. Caller must enforce auth + max
 * size before issuing the URL (P1-017+); the validated size is passed as
 * `contentLength` so R2 enforces it at upload time (see PutSignOptions).
 */
export async function signClipPutUrl(
  objectKey: string,
  options: PutSignOptions,
): Promise<string> {
  assertClipObjectKey(objectKey);
  assertPutContentLength(options.contentLength);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: options.contentType ?? "video/mp4",
    ContentLength: options.contentLength,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: options.expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

function assertGroupPhotoObjectKey(objectKey: string): void {
  const key = objectKey.trim();
  if (!key || key.includes("://")) {
    throw new Error(
      "Group photo storage keys must be object keys, not URLs",
    );
  }
  if (!key.startsWith(GROUP_PHOTO_KEY_PREFIX)) {
    throw new Error(`Group photo keys must start with "${GROUP_PHOTO_KEY_PREFIX}"`);
  }
}

/**
 * Short-lived signed PUT for uploading a group photo. Caller enforces auth +
 * size; the validated size is passed as `contentLength` so R2 enforces it at
 * upload time (see PutSignOptions).
 */
export async function signGroupPhotoPutUrl(
  objectKey: string,
  options: PutSignOptions,
): Promise<string> {
  assertGroupPhotoObjectKey(objectKey);
  assertPutContentLength(options.contentLength);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: options.contentType ?? "image/jpeg",
    ContentLength: options.contentLength,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: options.expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

/** Short-lived signed GET for a group photo. */
export async function signGroupPhotoGetUrl(
  objectKey: string,
  expiresInSec?: number,
): Promise<string> {
  assertGroupPhotoObjectKey(objectKey);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(client, cmd, {
    expiresIn: expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

function assertMessageMediaObjectKey(objectKey: string): void {
  const key = objectKey.trim();
  if (!key || key.includes("://")) {
    throw new Error(
      "Message media keys must be object keys, not URLs",
    );
  }
  if (!key.startsWith(MESSAGE_MEDIA_KEY_PREFIX)) {
    throw new Error(`Message media keys must start with "${MESSAGE_MEDIA_KEY_PREFIX}"`);
  }
}

/**
 * Short-lived signed PUT for an image or video uploaded inline in a chat.
 * Caller enforces auth + size; the validated size is passed as
 * `contentLength` so R2 enforces it at upload time (see PutSignOptions).
 */
export async function signMessageMediaPutUrl(
  objectKey: string,
  options: PutSignOptions,
): Promise<string> {
  assertMessageMediaObjectKey(objectKey);
  assertPutContentLength(options.contentLength);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: options.contentType ?? "application/octet-stream",
    ContentLength: options.contentLength,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: options.expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

/** Short-lived signed GET for inline message media (image or video). */
export async function signMessageMediaGetUrl(
  objectKey: string,
  expiresInSec?: number,
): Promise<string> {
  assertMessageMediaObjectKey(objectKey);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(client, cmd, {
    expiresIn: expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

/** Short-lived signed GET after permission checks (Supabase session + post visibility in later tickets). */
export async function signClipGetUrl(
  objectKey: string,
  expiresInSec?: number,
): Promise<string> {
  assertClipObjectKey(objectKey);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(client, cmd, {
    expiresIn: expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

function assertOrgAssetObjectKey(objectKey: string): void {
  const key = objectKey.trim();
  if (!key || key.includes("://")) {
    throw new Error("Org asset keys must be object keys, not URLs");
  }
  if (!key.startsWith(ORG_ASSET_KEY_PREFIX)) {
    throw new Error(`Org asset keys must start with "${ORG_ASSET_KEY_PREFIX}"`);
  }
}

/**
 * Short-lived signed PUT for an org banner / logo / post media. Caller is
 * responsible for verifying the viewer is owner/admin of the org and for
 * enforcing size/type limits before issuing the signed URL; the validated
 * size is passed as `contentLength` so R2 enforces it at upload time
 * (see PutSignOptions).
 */
export async function signOrgAssetPutUrl(
  objectKey: string,
  options: PutSignOptions,
): Promise<string> {
  assertOrgAssetObjectKey(objectKey);
  assertPutContentLength(options.contentLength);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: options.contentType ?? "application/octet-stream",
    ContentLength: options.contentLength,
  });
  return getSignedUrl(client, cmd, {
    expiresIn: options.expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

/** Short-lived signed GET for an org asset. Used to render banner/logo and post media. */
export async function signOrgAssetGetUrl(
  objectKey: string,
  expiresInSec?: number,
): Promise<string> {
  assertOrgAssetObjectKey(objectKey);
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = getR2S3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(client, cmd, {
    expiresIn: expiresInSec ?? DEFAULT_SIGN_EXPIRES_SEC,
  });
}

export async function probeR2Bucket(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    const bucket = requireEnv("R2_BUCKET_NAME");
    const client = getR2S3Client();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
