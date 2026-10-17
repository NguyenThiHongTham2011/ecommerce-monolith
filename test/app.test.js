const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const v = require("../src/validation");
const { createOrder } = require("../src/orders");
const config = { secret: "a".repeat(48), jwtExpiresIn: "1h" };
test("health returns 503 when database is down", async () => {
  const app = createApp(
    {
      $queryRaw: async () => {
        throw Error();
      },
    },
    config,
  );
  await request(app).get("/health").expect(503);
});
test("health confirms database query succeeded", async () => {
  let queried = false;
  const app = createApp(
    {
      $queryRaw: async () => {
        queried = true;
      },
    },
    config,
  );
  await request(app).get("/health").expect(200);
  assert.ok(queried);
});
test("unauthenticated product writes are blocked", async () => {
  await request(createApp({}, config))
    .post("/api/products")
    .send({})
    .expect(401);
});
test("expired JWT is rejected", async () => {
  const token = jwt.sign({}, config.secret, {
    subject: "1",
    issuer: "ecommerce-monolith",
    audience: "ecommerce-api",
    expiresIn: -1,
  });
  await request(createApp({}, config))
    .get("/api/users/me")
    .set("Authorization", "Bearer " + token)
    .expect(401);
});
test("customer cannot change stock", async () => {
  const db = {
    user: {
      findUnique: async () => ({ uid: 1, role: { rolename: "customer" } }),
    },
  };
  const token = jwt.sign({}, config.secret, {
    subject: "1",
    issuer: "ecommerce-monolith",
    audience: "ecommerce-api",
  });
  await request(createApp(db, config))
    .post("/api/products")
    .set("Authorization", "Bearer " + token)
    .send({})
    .expect(403);
});
test("registration rejects self-assigned admin role", () => {
  assert.equal(
    v.register.safeParse({
      username: "user",
      fullname: "User",
      password: "long-password-123",
      roleid: 1,
    }).success,
    false,
  );
});
test("money and quantities require valid types and ranges", () => {
  assert.equal(
    v.product.safeParse({ pname: "A", price: "1.001", quantity: 2 }).success,
    false,
  );
  assert.equal(
    v.product.safeParse({ pname: "A", price: "1.00", quantity: -1 }).success,
    false,
  );
  assert.equal(
    v.product.safeParse({ pname: "A", price: "1.00", quantity: 2 }).success,
    true,
  );
});
test("duplicate products in order rejected", () => {
  assert.equal(
    v.order.safeParse({
      items: [
        { pid: 1, qty: 1 },
        { pid: 1, qty: 2 },
      ],
    }).success,
    false,
  );
});
test("order uses server price and conditional inventory decrement", async () => {
  let where;
  const tx = {
    product: {
      findUnique: async () => ({ price: "25.00" }),
      updateMany: async (args) => {
        where = args.where;
        return { count: 1 };
      },
    },
    order: { create: async (args) => args.data },
  };
  const row = await createOrder({ $transaction: (fn) => fn(tx) }, 7, [
    { pid: 3, qty: 2 },
  ]);
  assert.deepEqual(where, { pid: 3, quantity: { gte: 2 } });
  assert.equal(row.uid, 7);
  assert.equal(row.details.create[0].unit_price, "25.00");
  assert.equal(row.shipments.create.status, "PENDING");
});
test("insufficient inventory prevents order creation", async () => {
  let created = false;
  const tx = {
    product: {
      findUnique: async () => ({ price: "25.00" }),
      updateMany: async () => ({ count: 0 }),
    },
    order: {
      create: async () => {
        created = true;
      },
    },
  };
  await assert.rejects(
    createOrder({ $transaction: (fn) => fn(tx) }, 7, [{ pid: 3, qty: 2 }]),
    (e) => e.status === 409,
  );
  assert.equal(created, false);
});
test("another customer cannot read order details", async () => {
  const db = {
    user: {
      findUnique: async () => ({ uid: 2, role: { rolename: "customer" } }),
    },
    order: { findUnique: async () => ({ oid: 1, uid: 1 }) },
  };
  const token = jwt.sign({}, config.secret, {
    subject: "2",
    issuer: "ecommerce-monolith",
    audience: "ecommerce-api",
  });
  await request(createApp(db, config))
    .get("/api/orders/1")
    .set("Authorization", "Bearer " + token)
    .expect(403);
});
