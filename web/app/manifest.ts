import type { MetadataRoute } from "next";

/** Lets the site be added to an iPad/phone home screen as "PFE" and open full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PFE Hitlist",
    short_name: "PFE",
    description: "Test & balance completion tracker",
    start_url: "/projects",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#1f4e79",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
