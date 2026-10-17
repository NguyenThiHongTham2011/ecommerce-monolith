const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const v = require("./validation");
const { createOrder, httpError } = require("./orders");
const publicUser = {
  uid: true,
  username: true,
  fullname: true,
  role: { select: { roleid: true, rolename: true } },
  membership: true,
};
function createApp(db, config) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", async (req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "healthy", database: "connected" });
    } catch {
      res.status(503).json({ status: "unhealthy", database: "unavailable" });
    }
  });
  app.get("/", (req, res) => res.json({ name: "Ecommerce Monolith MVP" }));
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const data = v.register.parse(req.body);
    const role = await db.role.findUnique({ where: { rolename: "normal" } });
    const membership = await db.memberShip.findUnique({
      where: { mname: "Basic" },
    });
    if (!role || !membership) throw httpError(503, "Run database seed first");
    const user = await db.user.create({
      data: {
        ...data,
        password: await bcrypt.hash(data.password, 12),
        roleid: role.roleid,
        mid: membership.mid,
      },
      select: publicUser,
    });
    res.status(201).json(user);
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const data = v.login.parse(req.body);
    const user = await db.user.findUnique({
      where: { username: data.username },
    });
    if (!user || !(await bcrypt.compare(data.password, user.password)))
      throw httpError(401, "Invalid credentials");
    res.json({
      token: jwt.sign({}, config.secret, {
        subject: String(user.uid),
        algorithm: "HS256",
        issuer: "ecommerce-monolith",
        audience: "ecommerce-api",
        expiresIn: config.jwtExpiresIn,
      }),
      tokenType: "Bearer",
    });
  });
  async function auth(req, res, next) {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
    if (!match) throw httpError(401, "Bearer token required");
    let payload;
    try {
      payload = jwt.verify(match[1], config.secret, {
        algorithms: ["HS256"],
        issuer: "ecommerce-monolith",
        audience: "ecommerce-api",
      });
      v.id(payload.sub);
    } catch {
      throw httpError(401, "Invalid or expired token");
    }
    req.user = await db.user.findUnique({
      where: { uid: Number(payload.sub) },
      select: publicUser,
    });
    if (!req.user) throw httpError(401, "User no longer exists");
    next();
  }
  function admin(req, res, next) {
    if (req.user.role.rolename !== "admin")
      throw httpError(403, "Admin required");
    next();
  }
  app.get("/api/products", async (req, res) =>
    res.json(await db.product.findMany({ take: 100, orderBy: { pid: "asc" } })),
  );
  app.get("/api/products/:id", async (req, res) => {
    const row = await db.product.findUnique({
      where: { pid: v.id(req.params.id) },
    });
    if (!row) throw httpError(404, "Product not found");
    res.json(row);
  });
  app.post("/api/products", auth, admin, async (req, res) =>
    res
      .status(201)
      .json(await db.product.create({ data: v.product.parse(req.body) })),
  );
  app.put("/api/products/:id", auth, admin, async (req, res) =>
    res.json(
      await db.product.update({
        where: { pid: v.id(req.params.id) },
        data: v.product.parse(req.body),
      }),
    ),
  );
  app.delete("/api/products/:id", auth, admin, async (req, res) => {
    await db.product.delete({ where: { pid: v.id(req.params.id) } });
    res.status(204).end();
  });
  app.get("/api/users/me", auth, (req, res) => res.json(req.user));
  app.patch("/api/users/me", auth, async (req, res) => {
    const data = v.register.pick({ fullname: true }).strict().parse(req.body);
    res.json(
      await db.user.update({
        where: { uid: req.user.uid },
        data,
        select: publicUser,
      }),
    );
  });
  app.get("/api/users", auth, admin, async (req, res) =>
    res.json(await db.user.findMany({ select: publicUser, take: 100 })),
  );
  app.get("/api/roles", auth, admin, async (req, res) =>
    res.json(await db.role.findMany()),
  );
  app.get("/api/memberships", auth, async (req, res) =>
    res.json(await db.memberShip.findMany()),
  );
  app.post("/api/memberships", auth, admin, async (req, res) =>
    res
      .status(201)
      .json(await db.memberShip.create({ data: v.membership.parse(req.body) })),
  );
  app.put("/api/memberships/:id", auth, admin, async (req, res) =>
    res.json(
      await db.memberShip.update({
        where: { mid: v.id(req.params.id) },
        data: v.membership.parse(req.body),
      }),
    ),
  );
  app.patch("/api/users/:id/membership", auth, admin, async (req, res) => {
    const data = require("zod")
      .z.object({
        mid: require("zod").z.number().int().positive().max(2147483647),
      })
      .strict()
      .parse(req.body);
    res.json(
      await db.user.update({
        where: { uid: v.id(req.params.id) },
        data,
        select: publicUser,
      }),
    );
  });
  app.post("/api/orders", auth, async (req, res) =>
    res
      .status(201)
      .json(await createOrder(db, req.user.uid, v.order.parse(req.body).items)),
  );
  app.get("/api/orders", auth, async (req, res) =>
    res.json(
      await db.order.findMany({
        where: req.user.role.rolename === "admin" ? {} : { uid: req.user.uid },
        include: { details: true, shipments: true },
        take: 100,
        orderBy: { oid: "desc" },
      }),
    ),
  );
  async function ownedOrder(req, res, next) {
    req.order = await db.order.findUnique({
      where: { oid: v.id(req.params.id) },
      include: { details: true, shipments: true },
    });
    if (!req.order) throw httpError(404, "Order not found");
    if (req.order.uid !== req.user.uid && req.user.role.rolename !== "admin")
      throw httpError(403, "Not your order");
    next();
  }
  app.get("/api/orders/:id", auth, ownedOrder, (req, res) =>
    res.json(req.order),
  );
  app.post(
    "/api/orders/:id/shipments",
    auth,
    admin,
    ownedOrder,
    async (req, res) =>
      res
        .status(201)
        .json(
          await db.shipment.create({
            data: { oid: req.order.oid, ...v.shipment.parse(req.body) },
          }),
        ),
  );
  app.patch("/api/shipments/:id", auth, admin, async (req, res) =>
    res.json(
      await db.shipment.update({
        where: { shipid: v.id(req.params.id) },
        data: v.shipment.parse(req.body),
      }),
    ),
  );
  app.use((req, res) => res.status(404).json({ message: "Route not found" }));
  app.use((err, req, res, next) => {
    if (err.name === "ZodError")
      return res
        .status(400)
        .json({
          message: "Invalid input",
          issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
        });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON" });
    if (err.type === "entity.too.large")
      return res.status(413).json({ message: "Request body too large" });
    const codes = {
      P2002: [409, "Value already exists"],
      P2003: [409, "Related record prevents operation"],
      P2025: [404, "Record not found"],
      P2034: [409, "Concurrent change: retry request"],
    };
    const mapped = codes[err.code];
    if (mapped) return res.status(mapped[0]).json({ message: mapped[1] });
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    console.error(err.code || err.name);
    res.status(500).json({ message: "Internal server error" });
  });
  return app;
}
module.exports = { createApp };
