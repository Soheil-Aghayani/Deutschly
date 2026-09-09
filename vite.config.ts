import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const deferGeneratedStylesheet = {
  name: "defer-generated-stylesheet",
  transformIndexHtml: {
    order: "post" as const,
    handler(html: string) {
      return html.replace(
        /<link rel="stylesheet"([^>]+)>/g,
        '<link rel="preload" as="style"$1 onload="this.onload=null;this.rel=\'stylesheet\'"><noscript><link rel="stylesheet"$1></noscript>',
      );
    },
  },
};

export default defineConfig({
  plugins: [react(), deferGeneratedStylesheet],
  base: "./",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
