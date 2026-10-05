import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  const outputDir = desktop ? ".output-desktop" : ".output";
  return {
    define: { "import.meta.env.VITE_DESKTOP": JSON.stringify(desktop ? "1" : "0") },
    server: { host: "127.0.0.1", port: 3000 },
    preview: { host: "127.0.0.1", port: 3000 },
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
        ...(desktop
          ? {
              spa: {
                enabled: true,
                prerender: { outputPath: "/index.html", autoSubfolderIndex: false },
              },
            }
          : {}),
      }),
      nitro({
        preset: "node-server",
        output: {
          dir: outputDir,
          publicDir: `${outputDir}/public`,
          serverDir: `${outputDir}/server`,
        },
      }),
      react(),
      ...(!desktop
        ? [
            VitePWA({
              outDir: ".output/public",
              registerType: "autoUpdate",
              injectRegister: null,
              filename: "sw.js",
              manifest: false,
              devOptions: { enabled: false },
              workbox: {
                navigateFallback: null,
                globPatterns: ["**/*.{js,mjs,css,woff,woff2,png,ico,svg,docx}"],
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
                runtimeCaching: [
                  {
                    urlPattern: ({ request, url }) =>
                      request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
                    handler: "NetworkFirst",
                    options: { cacheName: "rf-pages", networkTimeoutSeconds: 3 },
                  },
                ],
              },
            }),
          ]
        : []),
    ],
  };
});
