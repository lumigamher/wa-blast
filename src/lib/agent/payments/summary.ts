type OrderLike = { id: string; totalCop: number; itemsJson: string };

export function buildOrderSummaryText(order: OrderLike): string {
  let items: Array<{ nombre?: string; cantidad?: number; subtotal?: number }> = [];
  try {
    items = JSON.parse(order.itemsJson);
  } catch {
    items = [];
  }
  const fmt = (n: number) => `$${new Intl.NumberFormat("es-CO").format(n)}`;
  const lines = items.map(
    (i) => `• ${i.cantidad ?? 1}x ${i.nombre ?? "Producto"} — ${fmt(i.subtotal ?? 0)}`,
  );
  return [
    `Resumen de tu pedido (${order.id.slice(0, 8)}):`,
    ...lines,
    `Total: ${fmt(order.totalCop)}`,
  ].join("\n");
}
