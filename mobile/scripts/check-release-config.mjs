#!/usr/bin/env node
/**
 * The last check before an Archive (iOS) or a bundle (Android):
 *
 *   npx cap sync            (WITHOUT CAP_DEV_URL)
 *   npm run release:check
 *
 * capacitor.config.ts is evaluated at sync time and copied into two generated,
 * gitignored files. A sync done with CAP_DEV_URL set leaves the Mac's dev
 * server URL, with cleartext HTTP allowed, in those copies, and the next
 * Archive would ship it to the store. This script reads the copies the build
 * will actually use, so it catches that no matter what the .ts file says now.
 * It also checks each copy still carries the app's user-agent tag, since that
 * tag alone is what hides Vibe+ checkout inside the store apps.
 *
 * It also guards the public repo: Xcode writes the Apple Team ID into
 * project.pbxproj the moment anyone picks a team, and a keystore password in
 * build.gradle would be just as public. Nothing runs this at commit time, so
 * it only protects a commit when someone runs it first.
 *
 * Exits 1 with one line per problem, 0 when the build is safe to ship.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_URL = "https://www.connectvibe.app";

// The user-agent tag is how the website knows it's inside a store app
// (src/lib/native/detect.ts). Without it the app shows Vibe+ prices and
// checkout, which neither store allows (plan §5 SD1), so it's checked here too.
const GENERATED_CONFIGS = [
  { file: "ios/App/App/capacitor.config.json", platform: "ios", userAgent: "VibeApp/1 (ios)" },
  {
    file: "android/app/src/main/assets/capacitor.config.json",
    platform: "android",
    userAgent: "VibeApp/1 (android)",
  },
];
const START_PATH = "/campus";
const ERROR_PATH = "offline.html";
// `cleartext: true` also writes this into the Cordova plugins' manifest.
const CORDOVA_MANIFEST = "android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml";
const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";
const APP_GRADLE = "android/app/build.gradle";

const problems = [];
const where = (file) => relative(process.cwd(), resolve(MOBILE, file)) || file;

function read(file) {
  const path = resolve(MOBILE, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

// ---- the synced configs ----------------------------------------------------

for (const { file, platform, userAgent } of GENERATED_CONFIGS) {
  const text = read(file);
  if (text === null) {
    problems.push(`${where(file)} is missing. Run \`npx cap sync\` first.`);
    continue;
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    problems.push(`${where(file)} isn't valid JSON. Run \`npx cap sync\` again.`);
    continue;
  }
  const server = config.server ?? {};
  if (server.url !== LIVE_URL) {
    problems.push(
      `${where(file)}: server.url is ${JSON.stringify(server.url)}, not "${LIVE_URL}". ` +
        "Re-sync without CAP_DEV_URL.",
    );
  }
  if (server.cleartext) {
    problems.push(`${where(file)}: cleartext HTTP is allowed. Re-sync without CAP_DEV_URL.`);
  }
  if (Array.isArray(server.allowNavigation) && server.allowNavigation.length > 0) {
    problems.push(`${where(file)}: allowNavigation lets other sites load inside the app.`);
  }
  // Both native projects read the platform's own key first and fall back to
  // the top-level one, so this is the value the app will actually send.
  const agent = config[platform]?.appendUserAgent ?? config.appendUserAgent;
  if (agent !== userAgent) {
    problems.push(
      `${where(file)}: the user-agent tag is ${JSON.stringify(agent)}, not "${userAgent}". ` +
        "The site finds the app by this tag; without it the app shows Vibe+ checkout.",
    );
  }
  if (server.appStartPath !== START_PATH) {
    problems.push(`${where(file)}: server.appStartPath is ${JSON.stringify(server.appStartPath)}, not "${START_PATH}".`);
  }
  if (server.errorPath !== ERROR_PATH) {
    problems.push(`${where(file)}: server.errorPath is ${JSON.stringify(server.errorPath)}, not "${ERROR_PATH}".`);
  }
}

// iOS Capacitor exits at launch unless <bundle>/public + appStartPath exists
// on disk, even though the app loads server.url (CAPBridgeViewController.swift
// loadWebView). The folder comes from www/campus/ through `npx cap sync`.
if (!existsSync(resolve(MOBILE, "ios/App/App/public", START_PATH.replace(/^\//, ""), "index.html"))) {
  problems.push(
    `ios/App/App/public${START_PATH}/index.html is missing, so the iPhone app would quit at launch. ` +
      "Keep www/campus/index.html and run `npx cap sync`.",
  );
}

const cordovaManifest = read(CORDOVA_MANIFEST);
if (cordovaManifest && /usesCleartextTraffic\s*=\s*"true"/.test(cordovaManifest)) {
  problems.push(`${where(CORDOVA_MANIFEST)}: cleartext HTTP is on. Re-sync without CAP_DEV_URL.`);
}

// ---- secrets in committed files ------------------------------------------------

// A non-empty Team ID. Picking a team in Xcode writes it twice: as the
// DEVELOPMENT_TEAM build setting, and as DevelopmentTeam in the target's
// TargetAttributes block. `DEVELOPMENT_TEAM = "";` is fine.
const TEAM = /(?:DEVELOPMENT_TEAM|DevelopmentTeam)\s*=\s*"?([A-Za-z0-9]+)"?\s*;/;

function teamIn(text, label) {
  if (text && TEAM.test(text)) {
    problems.push(
      `${label} has an Apple Team ID (DEVELOPMENT_TEAM or DevelopmentTeam). The repo is ` +
        "public: discard both hunks before committing (see mobile/README.md, \"Signing\").",
    );
  }
}

teamIn(read(PBXPROJ), where(PBXPROJ));
// The staged copy too, in case the working copy was cleaned after `git add`.
try {
  const staged = execFileSync("git", ["show", `:mobile/${PBXPROJ}`], {
    cwd: MOBILE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  teamIn(staged, `${where(PBXPROJ)} (staged)`);
} catch {
  // Not staged, not tracked yet, or no git here: nothing to check.
}

const gradle = read(APP_GRADLE);
// A literal after the setting name (`storePassword "..."`, `= "..."`), but not
// the name used as a key, as in keystoreProperties['storePassword'].
if (gradle && /(?<!["'])\b(storePassword|keyPassword)(?:\s*=\s*|\s*\(\s*|\s+)["']/.test(gradle)) {
  problems.push(
    `${where(APP_GRADLE)} has a keystore password written into it. ` +
      "It belongs in the gitignored keystore.properties.",
  );
}

// ---- verdict -------------------------------------------------------------------

if (problems.length > 0) {
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `ok    both apps load ${LIVE_URL} with their app tag, no cleartext, ` +
      "no Team ID or keystore password in the project",
  );
}
