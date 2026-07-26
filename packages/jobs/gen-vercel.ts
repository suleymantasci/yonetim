/** vercel.json cron tanımlarını JOBS listesinden üretir (tek doğruluk kaynağı). */
import { writeFileSync } from "node:fs";

import { vercelCronConfig } from "./src/definitions";

const cfg = vercelCronConfig();
writeFileSync(
  "../../apps/app/vercel.json",
  JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", ...cfg }, null, 2) + "\n",
);
console.log(`${cfg.crons.length} cron tanımı apps/app/vercel.json dosyasına yazıldı.`);
