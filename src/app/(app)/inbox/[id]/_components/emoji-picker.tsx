"use client";

import { SmileIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EmojiData {
  e: string;
  k: string;
}

const EMOJI_LIST: EmojiData[] = [
  // Smileys & Faces
  { e: "😀", k: "feliz sonrisa cara happy smile" },
  { e: "😃", k: "feliz sonrisa cara happy smile" },
  { e: "😄", k: "feliz risa sonrisa happy laugh" },
  { e: "😁", k: "feliz sonrisa cara happy" },
  { e: "😆", k: "risa feliz happy laugh" },
  { e: "😅", k: "risa nervios feliz embarrassed laugh" },
  { e: "😂", k: "risa llorando feliz crying laugh" },
  { e: "🤣", k: "risa mucha feliz rofl laugh" },
  { e: "😊", k: "feliz sonrisa cara happy sweet" },
  { e: "😇", k: "ángel feliz cara angel innocent" },
  { e: "🙂", k: "sonrisa pequeña cara smile slight" },
  { e: "🙃", k: "sonrisa invertida cara upside down" },
  { e: "😉", k: "guiño ojo cara wink flirt" },
  { e: "😌", k: "pensativo relajado cara peaceful" },
  { e: "😍", k: "amor corazón ojos eyes love heart" },
  { e: "🥰", k: "amor corazón feliz love heart" },
  // More faces
  { e: "😲", k: "sorpresa asombro cara wow surprised" },
  { e: "😜", k: "lengua diversión cara playful tongue" },
  { e: "😤", k: "enojado molesto cara angry annoyed" },
  { e: "😭", k: "llorar triste sad crying tear" },
  { e: "🤔", k: "pensativo dudoso cara thinking hmm" },
  { e: "😱", k: "miedo asombro scared frightened shock" },
  { e: "🤗", k: "abrazo feliz cara hug embrace" },
  { e: "🎉", k: "fiesta celebración party celebrate confetti" },
  { e: "🎊", k: "fiesta celebración party celebrate" },
  // Gestures & Hands
  { e: "👋", k: "saludo adiós mano wave goodbye" },
  { e: "👍", k: "pulgar bien ok good thumbs up" },
  { e: "👎", k: "pulgar mal no dislike thumbs down" },
  { e: "✋", k: "mano saludo palm hand stop" },
  { e: "🖐️", k: "mano abierta palm hand open" },
  { e: "👌", k: "ok perfecto bien ok perfect" },
  { e: "🤌", k: "mano pinza gesto hand gesture" },
  { e: "🤏", k: "mano pequeña gesto hand small" },
  { e: "✌️", k: "paz victoria mano peace victory" },
  { e: "🤞", k: "suerte dedos crossed fingers luck" },
  { e: "👏", k: "aplausos manos clap congratulations" },
  { e: "🙏", k: "rezar manos gracias gracias thank you pray" },
  { e: "💪", k: "fuerza músculo poder strength arm" },
  { e: "🤝", k: "apretón mano acuerdo handshake deal" },
  { e: "🤲", k: "mano abierta ofrenda hands open" },
  { e: "🖤", k: "corazón negro dark heart" },
  // Hearts
  { e: "❤️", k: "corazón rojo amor love red heart" },
  { e: "🧡", k: "corazón naranja orange heart" },
  { e: "💛", k: "corazón amarillo yellow heart" },
  { e: "💚", k: "corazón verde green heart" },
  { e: "💙", k: "corazón azul blue heart" },
  { e: "💜", k: "corazón púrpura purple heart" },
  { e: "🤍", k: "corazón blanco white heart" },
  { e: "🤎", k: "corazón marrón brown heart" },
  { e: "💔", k: "corazón roto broken heart sad" },
  { e: "💕", k: "corazones dos love hearts double" },
  { e: "💞", k: "corazones giro revolving hearts" },
  { e: "💓", k: "corazón latidos heartbeat love" },
  { e: "💗", k: "corazón creciendo growing heart" },
  { e: "💖", k: "corazón brillo sparkling heart love" },
  { e: "💘", k: "flecha corazón cupid arrow heart" },
  { e: "💝", k: "corazón regalo gift heart present" },
  { e: "💟", k: "corazón botón heart button" },
  // Objects & Symbols
  { e: "⭐", k: "estrella star golden" },
  { e: "✨", k: "brillo sparkles magic shine" },
  { e: "🌟", k: "estrella brillo glowing star" },
  { e: "💫", k: "dizzy star swirl" },
  { e: "🔥", k: "fuego llama fire hot flame" },
  { e: "💯", k: "cien perfecto hundred perfect" },
  { e: "🎯", k: "diana objetivo target goal" },
  { e: "💡", k: "bombilla idea light bulb" },
  { e: "🚀", k: "cohete lanzamiento rocket launch" },
  { e: "🎁", k: "regalo presente gift box" },
  { e: "🎈", k: "globo fiesta balloon celebration" },
  { e: "🎀", k: "lazo regalo ribbon bow gift" },
  { e: "🎂", k: "pastel cumpleaños cake birthday" },
  { e: "🍰", k: "pastel postre dessert cake slice" },
  { e: "🍕", k: "pizza comida food meal" },
  { e: "🍔", k: "hamburguesa comida food meal" },
  { e: "🍣", k: "sushi comida food meal" },
  { e: "☕", k: "café bebida coffee drink" },
  { e: "🍻", k: "cerveza brindis beer cheers" },
  { e: "🍷", k: "vino bebida wine drink" },
  { e: "⏰", k: "reloj tiempo alarm clock time" },
  { e: "📱", k: "teléfono celular mobile phone" },
  { e: "📞", k: "teléfono llamada phone call" },
  { e: "💻", k: "computadora laptop computer" },
  { e: "🎬", k: "película cine film movie" },
  { e: "🎵", k: "música nota song music" },
  { e: "✅", k: "check aceptado ok done checkmark" },
  { e: "❌", k: "cruz error no x cross" },
  { e: "⚠️", k: "advertencia atención warning alert" },
  { e: "🔔", k: "campana notificación bell notification" },
  { e: "📢", k: "megáfono anuncio loudspeaker announce" },
  { e: "💬", k: "chat burbuja message bubble" },
  { e: "💰", k: "dinero dinero money cash" },
  { e: "💸", k: "dinero volador money flying cash" },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}

const normalizeString = (str: string): string => {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
};

export function EmojiPicker({ onPick, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredEmojis = searchTerm
    ? EMOJI_LIST.filter((item) =>
        normalizeString(item.k).includes(normalizeString(searchTerm))
      )
    : EMOJI_LIST;

  const handleEmojiClick = (emoji: string) => {
    onPick(emoji);
    setOpen(false);
    setSearchTerm("");
  };

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
        setSearchTerm("");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Insert emoji"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <SmileIcon className="size-5" />
      </button>
      {open && (
        <div
          ref={containerRef}
          className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border bg-background p-4 shadow-lg max-h-96 overflow-y-auto"
        >
          <div className="space-y-4">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar emoji…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-muted placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Search emojis"
            />
            {filteredEmojis.length > 0 ? (
              <div className="grid grid-cols-8 gap-1">
                {filteredEmojis.map((item) => (
                  <button
                    key={item.e}
                    type="button"
                    onClick={() => handleEmojiClick(item.e)}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={`Insert emoji ${item.e}`}
                  >
                    <span className="text-lg">{item.e}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
