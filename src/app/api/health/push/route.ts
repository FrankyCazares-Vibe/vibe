import { createECDH, createPrivateKey } from "node:crypto";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import {
  fcmConfig,
  pushEnabled,
  pushSiteOrigin,
  vapidConfig,
  type FcmConfig,
  type VapidConfig,
} from "@/lib/push/config";

// node:crypto checks the keys locally.
export const runtime = "nodejs";

/**
 * Plan §7 2C: can this deploy send push, and through which transport?
 * Platform admins only.
 *
 * BOOLEANS ONLY (critic-push.md item 16): no project id, no client email, no
 * key or fingerprint, and nothing about who is on the allow-list. No network
 * call and nothing is sent: the keys are checked on this server only.
 *   - webpushKeysMatch: the VAPID private key really produces the public key
 *     the browsers subscribed with. A mismatch fails every send with a 403.
 *   - fcmKeyUsable: the service account's private key parses as an RSA key.
 *
 * 200 when push is on and at least one transport is ready, else 503 with the
 * same booleans, so an admin can see which piece is missing.
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const env = process.env;
  const vapid = vapidConfig(env);
  const fcm = fcmConfig(env);
  const allowlist = (env.PUSH_ALLOWLIST ?? "").trim();

  const status = {
    enabled: pushEnabled(env),
    siteOriginKnown: pushSiteOrigin(env) !== null,
    allowlistSet: allowlist !== "",
    allowlistEveryone: allowlist === "*",
    webpushConfigured: vapid !== null,
    webpushKeysMatch: vapid !== null && vapidPairMatches(vapid),
    fcmConfigured: fcm !== null,
    fcmKeyUsable: fcm !== null && fcmKeyUsable(fcm),
  };
  const ready = status.enabled && (status.webpushKeysMatch || status.fcmKeyUsable);

  if (!ready) {
    return NextResponse.json(
      {
        ok: false,
        error: "Push isn't ready on this deploy. See the push section of .env.example.",
        ...status,
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, ...status });
}

function vapidPairMatches(vapid: VapidConfig): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(vapid.privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(vapid.publicKey, "base64url"));
  } catch {
    return false;
  }
}

function fcmKeyUsable(fcm: FcmConfig): boolean {
  try {
    return createPrivateKey(fcm.privateKey).asymmetricKeyType === "rsa";
  } catch {
    return false;
  }
}
