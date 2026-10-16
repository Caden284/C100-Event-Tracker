/** Usage: npm run backup:verify -- path/to/file.backup.json */
import { readFileSync } from "node:fs";
import { verifyBackup } from "../src/lib/backup";

const path = process.argv[2];
if (!path) { console.error("Usage: npm run backup:verify -- <file.backup.json>"); process.exit(1); }
const v = verifyBackup(JSON.parse(readFileSync(path, "utf8")));
console.log(v.ok ? "✔ Backup verified" : "✖ Backup FAILED verification");
console.table(v.counts);
for (const p of v.problems) console.log(" -", p);
process.exit(v.ok ? 0 : 1);
