import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // クライアントへ露出するデバッグフラグは NEXT_PUBLIC_* のみ（本番で ATLAS_DEBUG を誤って公開しない）
  env: {
    NEXT_PUBLIC_ATLAS_DEBUG: process.env.NEXT_PUBLIC_ATLAS_DEBUG ?? "false",
  },
};

export default nextConfig;
