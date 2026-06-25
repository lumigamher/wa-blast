import { MasterDetailShell } from "../_components/master-detail-shell";

export default function InboxLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MasterDetailShell basePath="/inbox" listWidthClass="md:w-[360px]" list={list} detail={detail} />
    </div>
  );
}
