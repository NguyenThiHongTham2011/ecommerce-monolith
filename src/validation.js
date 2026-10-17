const { z } = require("zod");
const username = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9_.-]+$/);
const register = z
  .object({
    username,
    fullname: z.string().trim().min(1).max(100),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 72,
        "Password exceeds 72 bytes",
      ),
  })
  .strict();
const login = z
  .object({ username, password: z.string().min(1).max(72) })
  .strict();
const product = z
  .object({
    pname: z.string().trim().min(1).max(100),
    price: z
      .string()
      .regex(
        /^\d{1,8}(\.\d{1,2})?$/,
        "Use a nonnegative decimal string, e.g. 25000.00",
      ),
    quantity: z.number().int().min(0).max(2147483647),
  })
  .strict();
const order = z
  .object({
    items: z
      .array(
        z
          .object({
            pid: z.number().int().positive().max(2147483647),
            qty: z.number().int().positive().max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.pid)).size === v.items.length,
    "Duplicate product",
  );
const shipment = z
  .object({ status: z.enum(["pending", "shipping", "delivered", "cancelled"]) })
  .strict();
const membership = z
  .object({
    mname: z.string().trim().min(1).max(50),
    score: z.number().int().min(0).max(2147483647),
  })
  .strict();
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) {
    const e = new Error("Invalid ID");
    e.status = 400;
    throw e;
  }
  return Number(value);
}
module.exports = { register, login, product, order, shipment, membership, id };
