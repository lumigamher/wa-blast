import Image from "next/image";

interface ShotProps {
  src: string;
  alt?: string;
  caption?: string;
}

export function Shot({ src, alt = "Lula app screenshot", caption }: ShotProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden ring-1 ring-neutral-200 shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
        {/* Browser chrome */}
        <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-2.5 flex items-center gap-3">
          {/* Dots */}
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-300" />
          </div>
          {/* URL pill */}
          <div className="flex-1 flex justify-center">
            <div className="bg-white rounded-full px-3 py-1 text-xs text-neutral-600 border border-neutral-200">
              app.luladev.com
            </div>
          </div>
        </div>

        {/* Screenshot */}
        <Image
          src={src}
          alt={alt}
          width={1440}
          height={900}
          quality={90}
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1440px"
          className="w-full h-auto block"
          priority={false}
        />
      </div>

      {/* Caption */}
      {caption && (
        <p className="text-sm text-neutral-600 text-center">{caption}</p>
      )}
    </div>
  );
}
