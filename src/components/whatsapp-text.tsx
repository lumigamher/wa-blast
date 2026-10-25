"use client";

import { Fragment, type ReactNode } from "react";
import {
  parseWhatsAppText,
  type Block,
  type Inline,
} from "@/lib/format/whatsapp-render";

type Props = {
  text: string | null | undefined;
  /**
   * Transforma cada trozo de texto plano (p. ej. para resaltar `{{n}}` en las
   * vistas previas de plantillas). Debe devolver nodos con `key` propia.
   */
  renderPlain?: (text: string) => ReactNode;
  /** Color del enlace; el default es legible (AA) en claro y oscuro. */
  linkClassName?: string;
};

const LINK_DEFAULT =
  "text-sky-700 dark:text-sky-300 underline underline-offset-2 break-all hover:opacity-80";

function renderInline(
  nodes: Inline[],
  props: Props,
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.type) {
      case "text":
        return (
          <Fragment key={key}>
            {props.renderPlain ? props.renderPlain(n.value) : n.value}
          </Fragment>
        );
      case "bold":
        return <strong key={key}>{renderInline(n.children, props, `${key}.`)}</strong>;
      case "italic":
        return <em key={key}>{renderInline(n.children, props, `${key}.`)}</em>;
      case "strike":
        return <s key={key}>{renderInline(n.children, props, `${key}.`)}</s>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-black/10 px-1 py-px font-mono text-[0.9em] dark:bg-white/15"
          >
            {n.value}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={props.linkClassName ?? LINK_DEFAULT}
          >
            {renderInline(n.children, props, `${key}.`)}
          </a>
        );
    }
  });
}

/** Salto de línea solo entre bloques "en línea" (los bloques de verdad ya cortan). */
const isFlow = (b: Block | undefined) => b?.type === "line" || b?.type === "list";

/**
 * Pinta texto con el formato de WhatsApp usando elementos React (sin
 * `dangerouslySetInnerHTML`). El contenedor debería tener `whitespace-pre-wrap`.
 */
export function WhatsAppText(props: Props) {
  const blocks = parseWhatsAppText(props.text);
  return (
    <>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        const br = isFlow(b) && isFlow(blocks[i + 1]) ? "\n" : "";
        switch (b.type) {
          case "line":
            return (
              <Fragment key={key}>
                {renderInline(b.children, props, `${key}.`)}
                {br}
              </Fragment>
            );
          case "list":
            return (
              <Fragment key={key}>
                <span className="inline-block min-w-4 text-right pr-1">{b.marker}</span>
                {renderInline(b.children, props, `${key}.`)}
                {br}
              </Fragment>
            );
          case "quote":
            return (
              <div
                key={key}
                className="my-0.5 border-l-[3px] border-current/40 pl-2 opacity-90"
              >
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && "\n"}
                    {renderInline(l, props, `${key}.${j}.`)}
                  </Fragment>
                ))}
              </div>
            );
          case "pre":
            return (
              <pre
                key={key}
                className="my-0.5 overflow-x-auto whitespace-pre rounded bg-black/10 p-2 font-mono text-[0.9em] dark:bg-white/15"
              >
                {b.value}
              </pre>
            );
        }
      })}
    </>
  );
}
