import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/punch",
    name: "Attendance & Salary",
    short_name: "Attendance",
    description: "Clock in, clock out and salary for small businesses.",
    lang: "en-IN",
    // The installed app opens on /start: the dashboard for a signed-in owner,
    // the punch screen for everyone else (kiosk tablets, employees' phones).
    start_url: "/start",
    scope: "/",
    // Full screen where the browser supports it (Android), otherwise like a normal app.
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home screen icon
    shortcuts: [
      {
        name: "Clock in / out",
        short_name: "Punch",
        url: "/punch",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Owner dashboard",
        short_name: "Dashboard",
        url: "/admin",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Payroll",
        short_name: "Payroll",
        url: "/admin/payroll",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
