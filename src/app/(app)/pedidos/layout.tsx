import { OrdersShell } from "./_components/orders-shell";

export default function PedidosLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OrdersShell list={list} detail={detail} />
    </div>
  );
}
