// Runs automatically before `npm run dev` / `npm run setup`.
// - Checks the Node version (BloxVault uses Node's built-in SQLite: Node 22.13+).
// - Makes sure a .env exists (only optional keys live there now) and repairs a UTF-16 one.
// The database itself is created automatically on first run at ./data/bloxvault.db.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`✗ BloxVault needs Node 22.13 or newer (you have ${process.versions.node}). Install the LTS from https://nodejs.org`);
  process.exit(1);
}

if (!existsSync(".env")) {
  if (existsSync(".env.example")) copyFileSync(".env.example", ".env");
  else writeFileSync(".env", "", "utf8");
  console.log("✓ Created .env");
}
const raw = readFileSync(".env");
if (raw[0] === 0xff && raw[1] === 0xfe) {
  writeFileSync(".env", raw.toString("utf16le").replace(/^\uFEFF/, ""), "utf8");
  console.log("✓ Converted .env from UTF-16 to UTF-8");
}
