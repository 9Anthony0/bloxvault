// `npm run db:fresh` — deletes the local database. It is recreated (empty) on next start.
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
const file = path.resolve(process.env.BLOXVAULT_DB || path.join("data", "bloxvault.db"));
for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) rmSync(f);
console.log(`✓ Deleted ${file}. Start the app to get a fresh, empty vault (or run npm run db:seed for demo games).`);
