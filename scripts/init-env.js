const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const file = path.join(__dirname, "../.env");
if (fs.existsSync(file)) {
  console.log(".env already exists: unchanged");
  process.exit(0);
}
let env = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
env = env
  .replaceAll(
    "replace_with_random_database_password",
    crypto.randomBytes(24).toString("hex"),
  )
  .replace(
    "replace_with_at_least_32_random_characters",
    crypto.randomBytes(48).toString("hex"),
  )
  .replace(
    "replace_with_strong_admin_password",
    crypto.randomBytes(18).toString("hex"),
  );
fs.writeFileSync(file, env, { flag: "wx", mode: 0o600 });
console.log(
  "Created .env with random secrets. Read ADMIN_PASSWORD locally; do not share .env.",
);
