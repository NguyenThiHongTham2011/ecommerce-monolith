function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
async function createOrder(db, uid, items) {
  return db.$transaction(
    async (tx) => {
      const details = [];
      // Consistent lock order reduces deadlocks; conditional decrement prevents overselling.
      for (const item of [...items].sort((a, b) => a.pid - b.pid)) {
        const product = await tx.product.findUnique({
          where: { pid: item.pid },
        });
        if (!product) throw httpError(404, "Product not found");
        const changed = await tx.product.updateMany({
          where: { pid: item.pid, quantity: { gte: item.qty } },
          data: { quantity: { decrement: item.qty } },
        });
        if (changed.count !== 1) throw httpError(409, "Insufficient stock");
        details.push({
          pid: item.pid,
          qty: item.qty,
          unit_price: product.price,
        });
      }
      return tx.order.create({
        data: { uid, details: { create: details }, shipments: { create: { status: "PENDING" } } },
        include: { details: true, shipments: true },
      });
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
module.exports = { createOrder, httpError };
