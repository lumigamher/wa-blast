/**
 * Parser puro del formato de WhatsApp (más el pseudo-markdown que escriben
 * agentes y clientes) a un árbol de tokens. NO genera HTML: el componente
 * `WhatsAppText` pinta el árbol con elementos React.
 *
 * Marcadores (igual que WhatsApp): *negrita*, _cursiva_, ~tachado~, `código`,
 * ```bloque```, y por línea `> cita`, `- item`, `* item`, `1. item`.
 * Un marcador solo aplica si abre pegado a un carácter no-espacio, cierra pegado
 * a uno no-espacio, en la misma línea, y la apertura está al inicio o tras
 * espacio/puntuación (así `2*3*4` o `snake_case_var` quedan intactos).
 * Extras: **x** y __x__ = negrita, [texto](url) = enlace, `# Título` = negrita.
 * Ver también `src/lib/agent/whatsapp-format.ts` (el camino inverso, al enviar).
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold" | "italic" | "strike"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "line"; children: Inline[] }
  | { type: "quote"; lines: Inline[][] }
  | { type: "list"; marker: string; children: Inline[] }
  | { type: "pre"; value: string };

const MARKS: Record<string, "bold" | "italic" | "strike"> = {
  "*": "bold",
  _: "italic",
  "~": "strike",
};

const isAlnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => !c || /\s/.test(c);

/** Busca el cierre de `mark` desde `from`; pegado a no-espacio y sin letra/número detrás. */
function findClose(s: string, mark: string, from: number): number {
  for (let j = from; j <= s.length - mark.length; j++) {
    if (!s.startsWith(mark, j)) continue;
    if (isSpace(s[j - 1])) continue;
    if (isAlnum(s[j + mark.length])) continue;
    return j;
  }
  return -1;
}

// Flag `y` (sticky): se prueba en `lastIndex` sin recortar el string (evita O(n²)).
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>]+/iy;
const MD_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/iy;

/** Quita puntuación final pegada a la URL (y `)` solo si no tiene su `(`). */
function trimUrl(url: string): string {
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (!last) return u;
    if (/[.,;:!?'"*_~\]]/.test(last)) {
      u = u.slice(0, -1);
    } else if (last === ")" && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) {
      u = u.slice(0, -1);
    } else return u;
  }
}

/** `noLinks`: dentro de un enlace no se generan más enlaces (un <a> no anida otro <a>). */
function parseInline(s: string, noLinks = false): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", value: buf });
    buf = "";
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const prev = s[i - 1];

    // [texto](url): el esquema se limita a http/https en la propia regex.
    if (c === "[" && !noLinks) {
      MD_LINK_RE.lastIndex = i;
      const m = MD_LINK_RE.exec(s);
      if (m) {
        flush();
        out.push({ type: "link", href: m[2], children: parseInline(m[1], true) });
        i += m[0].length;
        continue;
      }
    }

    // URL suelta (no pegada a una palabra).
    if (!noLinks && (c === "h" || c === "H" || c === "w" || c === "W") && !isAlnum(prev)) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(s);
      if (m) {
        const raw = trimUrl(m[0]);
        URL_RE.lastIndex = 0;
        if (URL_RE.test(raw)) {
          flush();
          const href = /^www\./i.test(raw) ? `https://${raw}` : raw;
          out.push({ type: "link", href, children: [{ type: "text", value: raw }] });
          i += raw.length;
          continue;
        }
      }
    }

    // Código en línea: contenido literal.
    if (c === "`" && !isAlnum(prev) && !isSpace(s[i + 1])) {
      const j = findClose(s, "`", i + 2);
      if (j > i + 1) {
        flush();
        out.push({ type: "code", value: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }

    // Negrita / cursiva / tachado; `**` y `__` también son negrita.
    if (c in MARKS && !isAlnum(prev) && !isSpace(s[i + 1])) {
      const double = s[i + 1] === c && (c === "*" || c === "_");
      if (double && !isSpace(s[i + 2])) {
        const j = findClose(s, c + c, i + 3);
        if (j > i + 2) {
          flush();
          out.push({ type: "bold", children: parseInline(s.slice(i + 2, j), noLinks) });
          i = j + 2;
          continue;
        }
      }
      const j = findClose(s, c, i + 2);
      if (j > i + 1) {
        flush();
        out.push({ type: MARKS[c], children: parseInline(s.slice(i + 1, j), noLinks) });
        i = j + 1;
        continue;
      }
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

function parseLines(text: string, out: Block[]) {
  for (const line of text.split("\n")) {
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      const last = out[out.length - 1];
      const inl = parseInline(quote[1]);
      if (last?.type === "quote") last.lines.push(inl);
      else out.push({ type: "quote", lines: [inl] });
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      out.push({
        type: "line",
        children: [{ type: "bold", children: parseInline(heading[1]) }],
      });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      out.push({ type: "list", marker: "•", children: parseInline(bullet[1]) });
      continue;
    }
    const num = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (num) {
      out.push({ type: "list", marker: `${num[1]}.`, children: parseInline(num[2]) });
      continue;
    }
    out.push({ type: "line", children: parseInline(line) });
  }
}

export function parseWhatsAppText(text: string | null | undefined): Block[] {
  if (!text) return [];
  const src = text.replace(/\r\n?/g, "\n");
  const out: Block[] = [];

  // Los bloques ``` se separan primero: adentro no hay formato y se conservan los saltos.
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const segments: Array<{ pre: boolean; value: string }> = [];
  while ((m = re.exec(src))) {
    if (!m[1].trim()) continue; // ``````: no es un bloque
    segments.push({ pre: false, value: src.slice(last, m.index) });
    segments.push({ pre: true, value: m[1].replace(/^\n/, "").replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  segments.push({ pre: false, value: src.slice(last) });

  segments.forEach((seg, idx) => {
    if (seg.pre) {
      out.push({ type: "pre", value: seg.value });
      return;
    }
    let v = seg.value;
    // El salto pegado al bloque ya lo aporta el propio bloque.
    if (idx > 0) v = v.replace(/^\n/, "");
    if (idx < segments.length - 1) v = v.replace(/\n$/, "");
    if (v === "" && segments.length > 1) return;
    parseLines(v, out);
  });
  return out;
}

function inlineToPlain(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "code") return n.value;
      return inlineToPlain(n.children);
    })
    .join("");
}

/** Texto plano sin marcadores (para vistas previas de una sola línea). */
export function stripWhatsAppFormat(text: string | null | undefined): string {
  return parseWhatsAppText(text)
    .map((b) => {
      switch (b.type) {
        case "pre":
          return b.value;
        case "quote":
          return b.lines.map(inlineToPlain).join("\n");
        case "list":
          return `${b.marker} ${inlineToPlain(b.children)}`;
        default:
          return inlineToPlain(b.children);
      }
    })
    .join("\n");
}
