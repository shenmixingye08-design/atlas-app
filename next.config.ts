import type { NextConfig } from "next";

import { sharpNativeTraceIncludes } from "./lib/images/sharp-native-trace";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Allow camera for mobile receipt / document capture on this origin only.
    value: "camera=(self), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
value: [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.atlasapp.jp https://challenges.cloudflare.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: https://img.clerk.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.atlasapp.jp https://api.stripe.com https://*.supabase.co https://api.openai.com wss://*.clerk.accounts.dev wss://clerk.atlasapp.jp",
  "frame-src 'self' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.atlasapp.jp https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; "),
  },
];

const nextConfig: NextConfig = {
  // クライアントへ露出するデバッグフラグは NEXT_PUBLIC_* のみ（本番で ATLAS_DEBUG を誤って公開しない）
  env: {
    NEXT_PUBLIC_ATLAS_DEBUG: process.env.NEXT_PUBLIC_ATLAS_DEBUG ?? "false",
  },
  // Append to Next's default externals (already includes sharp). Keep sharp
  // and the split @img native packages external so libvips is required from
  // node_modules, not bundled into route JS.
  serverExternalPackages: [
    "pg",
    "sharp",
    "@img/sharp-linux-x64",
    "@img/sharp-linuxmusl-x64",
    "@img/sharp-libvips-linux-x64",
    "@img/sharp-libvips-linuxmusl-x64",
  ],
  // NFT sees lib/index.js (`module.exports = __dirname`) but not the .so that
  // the linux-x64 .node dlopens. Force-include the native trees on image routes.
  outputFileTracingIncludes: sharpNativeTraceIncludes(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
