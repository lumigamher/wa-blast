import { MasterDetailShell } from "../_components/master-detail-shell";

export default function PedidosLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MasterDetailShell basePath="/pedidos" listWidthClass="md:w-[380px]" list={list} detail={detail} />
    </div>
  );
}
