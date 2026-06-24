import { InboxShell } from "./_components/inbox-shell";

export default function InboxLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InboxShell list={list} detail={detail} />
    </div>
  );
}
