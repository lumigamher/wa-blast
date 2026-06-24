export default function InboxLayout({
  list,
  detail,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* List Pane */}
        <div className="flex min-h-0 flex-col gap-3" data-pane="list">
          {list}
        </div>

        {/* Detail Pane */}
        <div className="flex min-h-0 flex-col md:flex md:flex-col" data-pane="detail">
          {detail}
        </div>
      </div>
    </div>
  );
}
