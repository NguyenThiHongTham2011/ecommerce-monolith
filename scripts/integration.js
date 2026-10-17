require("dotenv").config();
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
async function call(method, path, status, body, token) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  assert.equal(r.status, status, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
async function run() {
  assert.equal((await call("GET", "/health", 200)).database, "connected");
  const admin = (
    await call("POST", "/api/auth/login", 200, {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD,
    })
  ).token;
  const username = "test_" + Date.now();
  const credentials = { username, password: "Test-only-password-123" };
  const user = await call("POST", "/api/auth/register", 201, {
    ...credentials,
    fullname: "Integration Test",
  });
  assert.equal(user.password, undefined);
  assert.equal(user.role.rolename, "normal");
  assert.equal(user.membership.score, 10);
  const token = (await call("POST", "/api/auth/login", 200, credentials)).token;
  await call(
    "POST",
    "/api/products",
    403,
    { pname: "Forbidden", price: "1.00", quantity: 1 },
    token,
  );
  const product = await call(
    "POST",
    "/api/products",
    201,
    { pname: username, price: "25.50", quantity: 5 },
    admin,
  );
  await call(
    "PUT",
    "/api/products/" + product.pid,
    200,
    { pname: username, price: "25.50", quantity: 6 },
    admin,
  );
  await call(
    "POST",
    "/api/orders",
    400,
    { items: [{ pid: product.pid, qty: 0 }] },
    token,
  );
  const order = await call(
    "POST",
    "/api/orders",
    201,
    { items: [{ pid: product.pid, qty: 2 }] },
    token,
  );
  assert.equal(Number(order.details[0].unit_price), 25.5);
  assert.equal(
    (await call("GET", "/api/products/" + product.pid, 200)).quantity,
    4,
  );
  await call(
    "POST",
    "/api/orders",
    409,
    { items: [{ pid: product.pid, qty: 5 }] },
    token,
  );
  assert.equal(
    (await call("GET", "/api/products/" + product.pid, 200)).quantity,
    4,
  );
  const second = { username: username + "_2", password: credentials.password };
  await call("POST", "/api/auth/register", 201, {
    ...second,
    fullname: "Second User",
  });
  const secondToken = (await call("POST", "/api/auth/login", 200, second))
    .token;
  await call("GET", "/api/orders/" + order.oid, 403, null, secondToken);
  assert.equal(order.shipments.length, 1);
  const shipment = order.shipments[0];
  assert.equal(shipment.status, "PENDING");
  await call(
    "PATCH",
    "/api/shipments/" + shipment.shipid,
    200,
    { status: "shipping" },
    admin,
  );
  assert.equal(
    (await call("GET", "/api/orders/" + order.oid, 200, null, token)).shipments
      .length,
    1,
  );
  await call("DELETE", "/api/products/" + product.pid, 409, null, admin);
  const disposable = await call(
    "POST",
    "/api/products",
    201,
    { pname: "Disposable test product", price: "1.00", quantity: 1 },
    admin,
  );
  await call("DELETE", "/api/products/" + disposable.pid, 204, null, admin);
  await call("GET", "/api/products/" + disposable.pid, 404);
  console.log(
    "PASS: JWT, permissions, Product CRUD, order price/stock, ownership, shipment. Test users/orders retained for inspection.",
  );
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
