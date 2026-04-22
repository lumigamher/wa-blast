"use client";

import {
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  PlayIcon,
  ReplyIcon,
} from "lucide-react";
import type { WhatsAppTemplate } from "@/lib/meta/types";

type Size = "sm" | "md" | "lg";

type MediaPreview = {
  url?: string;
  fileName?: string;
};

type Props = {
  template: WhatsAppTemplate;
  values?: Record<string, string>;
  highlightVars?: boolean;
  showFrame?: boolean;
  size?: Size;
  time?: string;
  mediaPreview?: MediaPreview;
};

const sizeClass: Record<Size, { frame: string; bubble: string; text: string }> =
  {
    sm: { frame: "p-2", bubble: "px-2.5 py-1.5", text: "text-[12px]" },
    md: { frame: "p-3", bubble: "px-3 py-2", text: "text-[13px]" },
    lg: { frame: "p-4", bubble: "px-3.5 py-2.5", text: "text-[14px]" },
  };

export function WhatsAppBubble({
  template,
  values,
  highlightVars = false,
  showFrame = true,
  size = "md",
  time,
  mediaPreview,
}: Props) {
  const header = template.components.find((c) => c.type === "HEADER");
  const body = template.components.find((c) => c.type === "BODY");
  const footer = template.components.find((c) => c.type === "FOOTER");
  const buttons = template.components.find((c) => c.type === "BUTTONS");

  const headerFormat = header?.format?.toUpperCase();
  const isMediaHeader =
    headerFormat === "IMAGE" ||
    headerFormat === "VIDEO" ||
    headerFormat === "DOCUMENT";

  const sz = sizeClass[size];
  const bodyText = body?.text ?? "";
  const timeStr =
    time ??
    new Date().toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const bubbleTree = (
    <div className="ml-auto max-w-[92%] space-y-1">
      <div
        className={`relative rounded-lg rounded-tr-sm bg-[#d9fdd3] ${sz.bubble} shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]`}
      >
        {isMediaHeader ? (
          <MediaHeader
            format={headerFormat as "IMAGE" | "VIDEO" | "DOCUMENT"}
            preview={mediaPreview}
          />
        ) : header?.text ? (
          <div className={`mb-0.5 font-semibold text-[#111b21] ${sz.text}`}>
            {renderText(header.text, values, highlightVars)}
          </div>
        ) : null}
        <div
          className={`whitespace-pre-wrap break-words leading-[1.35] text-[#111b21] ${sz.text}`}
        >
          {renderText(bodyText, values, highlightVars)}
        </div>
        {footer?.text ? (
          <div className="mt-1 text-[11px] text-[#667781]">{footer.text}</div>
        ) : null}
        <div className="mt-0.5 flex items-center justify-end gap-1">
          <span className="text-[10px] text-[#667781] tabular-nums">
            {timeStr}
          </span>
          <DoubleCheck />
        </div>
      </div>
      {buttons?.buttons?.length ? (
        <div className="space-y-[2px]">
          {buttons.buttons.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]"
            >
              {b.type === "URL" ? (
                <ExternalLinkIcon className="size-3" />
              ) : (
                <ReplyIcon className="size-3" />
              )}
              {b.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (!showFrame) return bubbleTree;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-[#efeae2] ${sz.frame}`}
      style={{
        backgroundImage:
          "radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)",
        backgroundSize: "12px 12px, 24px 24px",
        backgroundPosition: "0 0, 6px 6px",
      }}
    >
      {bubbleTree}
    </div>
  );
}

function MediaHeader({
  format,
  preview,
}: {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  preview?: MediaPreview;
}) {
  if (format === "DOCUMENT") {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-md bg-white/60 p-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-[#d1ece1] text-[#008069]">
          <FileIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-[#111b21]">
            {preview?.fileName ?? "documento.pdf"}
          </div>
          <div className="text-[10px] text-[#667781]">PDF</div>
        </div>
      </div>
    );
  }
  if (format === "VIDEO") {
    return (
      <div className="relative mb-1 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-black/80">
        {preview?.url ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/media-has-caption
          <video
            src={preview.url}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-9 items-center justify-center rounded-full bg-white/90 text-black">
            <PlayIcon className="size-4 translate-x-[1px] fill-current" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative mb-1 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-[#cfd8dc]">
      {preview?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.url}
          alt={preview.fileName ?? "imagen"}
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon className="size-8 text-[#90a4ae]" />
      )}
    </div>
  );
}

function DoubleCheck() {
  return (
    <svg width="14" height="12" viewBox="0 0 16 15" className="text-[#53bdeb]">
      <path
        fill="currentColor"
        d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51zm3.94 0l-.478-.372a.365.365 0 0 0-.51.063L8.4 9.879a.32.32 0 0 1-.484.033L7.425 9.386a.36.36 0 0 0-.51.071l-.406.508a.364.364 0 0 0 .073.513l1.27 1.26c.143.14.361.124.484-.034l6.274-8.048a.365.365 0 0 0-.063-.51z"
      />
    </svg>
  );
}

function renderText(
  text: string,
  values?: Record<string, string>,
  highlightVars?: boolean,
) {
  const parts = text.split(/(\{\{\d+\}\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{\{(\d+)\}\}$/);
    if (!m) return <span key={i}>{p}</span>;
    const idx = m[1];
    const v = values?.[idx]?.trim();
    if (v) return <span key={i}>{v}</span>;
    if (highlightVars) {
      return (
        <span
          key={i}
          className="mx-0.5 inline-block rounded bg-amber-200/90 px-1 py-[1px] font-mono text-[11px] font-semibold text-amber-900"
        >
          {`{{${idx}}}`}
        </span>
      );
    }
    return <span key={i}>{`{{${idx}}}`}</span>;
  });
}
