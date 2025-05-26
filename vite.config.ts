import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: '/', // Ensures relative paths for assets
  build: {
    outDir: 'dist', // Specifies the output directory for the build
  },
  plugins: [
    tailwindcss(),
  ],
});