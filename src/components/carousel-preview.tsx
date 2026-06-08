"use client";

export type PreviewCard = { mediaUrl: string | null; body: string; buttons: string[] };

export function CarouselPreview({ topBody, cards }: { topBody: string; cards: PreviewCard[] }) {
  return (
    <div className="space-y-2">
      {topBody && <div className="rounded-lg bg-[#dcf8c6] px-3 py-2 text-sm text-black max-w-xs">{topBody}</div>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((c, i) => (
          <div key={i} className="w-48 shrink-0 rounded-lg border bg-white text-black shadow-sm">
            {c.mediaUrl
              ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.mediaUrl} alt="" className="h-28 w-full rounded-t-lg object-cover" />
                  </>
                )
              : <div className="flex h-28 items-center justify-center rounded-t-lg bg-muted text-xs text-muted-foreground">sin media</div>}
            <div className="space-y-2 p-2">
              <p className="text-xs">{c.body}</p>
              {c.buttons.map((b, bi) => <div key={bi} className="rounded border px-2 py-1 text-center text-xs text-blue-600">{b}</div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
