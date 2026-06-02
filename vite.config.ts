// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Allow overriding the Nitro deploy preset via env var so the same codebase
// can be deployed to Cloudflare (default, used by Lovable) or Vercel.
//   - Lovable / sandbox build: preset stays "cloudflare-module" and the
//     custom src/server.ts wrapper (Cloudflare `export default { fetch }`)
//     is used.
//   - Vercel build: set NITRO_PRESET=vercel in the Vercel project's
//     Environment Variables. We then drop the custom server entry so Nitro
//     generates its own Node-compatible handler. Nitro emits `.vercel/output`
//     which Vercel auto-detects (Build Output API v3) — leave Vercel's
//     framework preset as "Other", Build Command = `bun run build`,
//     Output Directory = `.vercel/output`.
const nitroPreset = process.env.NITRO_PRESET;
const isCloudflare = !nitroPreset || nitroPreset === "cloudflare-module";

export default defineConfig({
  ...(isCloudflare
    ? {
        tanstackStart: {
          // Cloudflare wrapper at src/server.ts (SSR error normalization).
          server: { entry: "server" },
        },
      }
    : {}),
  ...(nitroPreset ? { nitro: { preset: nitroPreset } } : {}),
});
