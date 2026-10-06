import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon for iOS (it doesn't use SVG icons)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#22211d" }}>
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none">
          <path d="M8 20.5l4.5-4.5 3.5 3 7.5-8" stroke="#c5ce95" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="23.5" cy="11" r="1.9" fill="#c5ce95" />
        </svg>
      </div>
    ),
    size,
  );
}
