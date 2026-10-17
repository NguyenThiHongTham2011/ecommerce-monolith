const config = require("./config")();
const { createApp } = require("./app");
const db = require("./db");
let server;
async function start() {
  await db.$connect();
  server = createApp(db, config).listen(config.port, () =>
    console.log(`API listening on ${config.port}`),
  );
  server.on("error", async () => {
    await db.$disconnect();
    process.exit(1);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    if (server)
      server.close(async () => {
        await db.$disconnect();
        process.exit(0);
      });
    else db.$disconnect().then(() => process.exit(0));
  });
start().catch(async () => {
  console.error("Startup failed: check database/configuration");
  await db.$disconnect();
  process.exit(1);
});
