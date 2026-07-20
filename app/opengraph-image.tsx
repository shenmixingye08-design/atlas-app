import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MINERVOT — あなた専属のAI秘書";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "linear-gradient(160deg, #ffffff 0%, #f5f7fa 55%, #e8f1fb 100%)",
          color: "#1d1d1f",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: 2, color: "#0071e3" }}>
          MINERVOT
        </div>
        <div style={{ marginTop: 28, fontSize: 64, fontWeight: 650, lineHeight: 1.15 }}>
          あなた専属のAI秘書
        </div>
        <div style={{ marginTop: 24, fontSize: 28, color: "#6e6e73", lineHeight: 1.4, maxWidth: 900 }}>
          仕事を覚え、繰り返し作業を減らし、あなたの時間を生み出します。
        </div>
      </div>
    ),
    { ...size },
  );
}
