import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "produktive", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
