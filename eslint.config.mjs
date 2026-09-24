import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The store apps' native shell has its own package.json, node_modules and
    // generated Xcode / Gradle trees (with minified Capacitor JS inside).
    // Relative to this file, so src/components/mobile/ is still linted.
    "mobile/**",
  ]),
]);

export default eslintConfig;
