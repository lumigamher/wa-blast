"use client";

import { useReducedMotion } from "motion/react";
import Image from "next/image";

interface ShotProps {
  src: string;
  alt?: string;
  caption?: string;
}

export function Shot({ src, alt = "Lula app screenshot", caption }: ShotProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="space-y-3">
      {/* Ambient glow backdrop (subtle radial blur behind the frame) */}
      <div className="relative">
        <div
          className="absolute inset-0 -z-10 rounded-3xl blur-3xl scale-110"
          style={{
            background: "radial-gradient(circle at center, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
          }}
        />

        <div
          className={`rounded-3xl overflow-hidden ring-1 ring-neutral-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18),0_8px_24px_-8px_rgba(0,0,0,0.12)] ${
            !prefersReducedMotion ? "transition-transform duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_25px_70px_-10px_rgba(0,0,0,0.22),0_12px_32px_-6px_rgba(0,0,0,0.14)]" : ""
          }`}
          style={!prefersReducedMotion ? {
            perspective: "2000px",
            transform: "perspective(2000px) rotateY(-4deg) rotateX(2deg)",
          } : undefined}
        >
          {/* Browser chrome */}
          <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-2.5 flex items-center gap-3">
            {/* Dots - smaller, cleaner */}
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-neutral-300" />
              <div className="w-2 h-2 rounded-full bg-neutral-300" />
              <div className="w-2 h-2 rounded-full bg-neutral-300" />
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
      </div>


      {/* Caption */}
      {caption && (
        <p className="text-sm text-neutral-600 text-center">{caption}</p>
      )}
    </div>
  );
}
