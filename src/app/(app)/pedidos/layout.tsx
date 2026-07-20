export default function PedidosLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {list}
      {detail}
    </div>
  );
}
