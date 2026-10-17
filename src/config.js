require("dotenv").config();
function config(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET.length < 32 ||
    env.JWT_SECRET.startsWith("replace_")
  )
    throw new Error("JWT_SECRET must contain at least 32 random characters");
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const jwtExpiresIn = env.JWT_EXPIRES_IN || "1h";
  if (!/^\d+[smhd]$/.test(jwtExpiresIn))
    throw new Error("Invalid JWT_EXPIRES_IN (example: 1h)");
  return { port, secret: env.JWT_SECRET, jwtExpiresIn };
}
module.exports = config;
