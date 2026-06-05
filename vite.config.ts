// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Allow overriding the Nitro deploy preset via env var while also detecting
// Vercel automatically. The Lovable config wrapper defaults Nitro output to
// `dist`, so Vercel needs an explicit `.vercel/output` layout.
const isVercelBuild = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const nitroPreset = isVercelBuild ? "vercel" : process.env.NITRO_PRESET;
const isCloudflare = !nitroPreset || nitroPreset === "cloudflare-module";
const vercelOutput = {
  dir: ".vercel/output",
  serverDir: ".vercel/output/functions/__server.func",
  publicDir: ".vercel/output/static",
};

export default defineConfig({
  ...(isCloudflare
    ? {
        tanstackStart: {
          // Cloudflare wrapper at src/server.ts (SSR error normalization).
          server: { entry: "server" },
        },
      }
    : {}),
  ...(nitroPreset
    ? {
        nitro: {
          preset: nitroPreset,
          ...(nitroPreset === "vercel" ? { output: vercelOutput } : {}),
        },
      }
    : {}),
});
