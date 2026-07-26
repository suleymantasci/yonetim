import { defineConfig } from "drizzle-kit";

import { loadRootEnv } from "../../env-loader.mjs";

loadRootEnv();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/yonetim",
  },
  verbose: true,
  strict: true,
});
