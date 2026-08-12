import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kynovant",
    short_name: "Kynovant",
    description:
      "Coaching operations software for managing clients, programs, check-ins, nutrition, and progress context.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080909",
    theme_color: "#080909",
    categories: ["business", "health", "productivity"],
    icons: [
      {
        src: "/icons/kynovant-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/kynovant-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/kynovant-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
