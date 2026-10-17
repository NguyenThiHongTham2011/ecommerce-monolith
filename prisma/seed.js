require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../src/db");
async function seed() {
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || "admin";
  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72 ||
    password.startsWith("replace_")
  )
    throw new Error("Set strong ADMIN_PASSWORD in .env (12-72 bytes)");
  const admin = await db.role.upsert({
    where: { rolename: "admin" },
    update: {},
    create: { rolename: "admin" },
  });
  await db.role.upsert({
    where: { rolename: "normal" },
    update: {},
    create: { rolename: "normal" },
  });
  const member = await db.memberShip.upsert({
    where: { mname: "Basic" },
    update: { score: 10 },
    create: { mname: "Basic", score: 10 },
  });
  await db.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      fullname: "Administrator",
      password: await bcrypt.hash(password, 12),
      roleid: admin.roleid,
      mid: member.mid,
    },
  });
  console.log("Seed complete (existing admin password unchanged)");
}
seed()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
