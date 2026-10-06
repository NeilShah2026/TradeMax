import type { MetadataRoute } from "next";

// Lets you "Add to Home Screen" and open TradeMax full-screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeMax",
    short_name: "TradeMax",
    description: "Personal trading journal — positions, live P&L, notes and analytics.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2ea",
    theme_color: "#f3f2ea",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
