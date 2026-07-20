"use client";

import { PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addNoteAction,
  type SendResult,
  sendMediaAction,
  sendMessageAction,
  sendVoiceAction,
} from "../../../actions";
import { EmojiPicker } from "./emoji-picker";
import { StickerPicker } from "./sticker-picker";
import type { ReplyTarget } from "./thread";
import { VoiceRecorder } from "./voice-recorder";

type Template = {
  name: string;
  language: string;
  bodyText: string;
  varCount: number;
};

type QuickReply = {
  id: string;
  shortcut: string;
  body: string;
};

type Sticker = {
  id: string;
  assetId: string;
};

type ComposerProps = {
  conversationId: string;
  windowOpen: boolean;
  templates: Template[];
  quickReplies: QuickReply[];
  stickers?: Sticker[];
  replyTo?: ReplyTarget | null;
  onReplyToChange?: (target: ReplyTarget | null) => void;
};

export function Composer({
  conversationId,
  windowOpen,
  templates,
  quickReplies,
  stickers = [],
  replyTo: initialReplyTo = null,
  onReplyToChange,
}: ComposerProps) {
  const router = useRouter();
  const [composerTab, setComposerTab] = useState<"reply" | "note">("reply");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<SendResult | null>(null);
  const [isTemplatePending, setIsTemplatePending] = useState(false);
  const [templateState, setTemplateState] = useState<SendResult | null>(null);
  // Controlado por el padre: usar el prop directamente (antes se copiaba a estado
  // interno con useState, que solo leía el valor inicial → el preview no aparecía
  // al dar "Responder" después de montar).
  const replyTo = initialReplyTo;
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    mime: string;
    base64: string;
    caption: string;
  } | null>(null);
  const [hasText, setHasText] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [notePending, setNotePending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when reply is set
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTo]);

  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [showQuickReplyDropdown, setShowQuickReplyDropdown] = useState(false);
  const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(-1);

  const filteredQuickReplies = useMemo(() => {
    if (!quickReplySearch) return [];
    return quickReplies.filter(
      (qr) =>
        qr.shortcut.toLowerCase().includes(quickReplySearch.toLowerCase()) ||
        qr.body.toLowerCase().includes(quickReplySearch.toLowerCase()),
    );
  }, [quickReplySearch, quickReplies]);

  const handleSendText = async (formData: FormData) => {
    const body = formData.get("message") as string;
    if (!body?.trim()) {
      setState({ ok: false, error: "Escribe un mensaje" });
      return;
    }
    setIsPending(true);
    const result = await sendMessageAction(
      conversationId,
      body,
      replyTo ? { replyTo: replyTo.wamid } : undefined,
    );
    setState(result);
    setIsPending(false);
    if (result.ok) {
      const form = document.querySelector(
        'form[data-composer="text"]',
      ) as HTMLFormElement;
      if (form) form.reset();
      setHasText(false);
      onReplyToChange?.(null);
      setQuickReplySearch("");
      setShowQuickReplyDropdown(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate) {
      const err = { ok: false, error: "Selecciona una plantilla" } as const;
      setTemplateState(err);
      return err;
    }
    setIsTemplatePending(true);
    const { sendTemplateToConversationAction } = await import("../../../actions");
    const result = await sendTemplateToConversationAction(conversationId, {
      templateName: selectedTemplate.name,
      language: selectedTemplate.language,
      params: templateVars,
    });
    setTemplateState(result);
    setIsTemplatePending(false);
    if (result.ok) {
      setSelectedTemplate(null);
      setTemplateVars([]);
    }
    return result;
  };

  const handleSendMedia = async () => {
    if (!selectedFile) return;

    setIsPending(true);
    const kind = selectedFile.mime.startsWith("image/")
      ? "image"
      : selectedFile.mime.startsWith("audio/")
        ? "audio"
        : selectedFile.mime.startsWith("video/")
          ? "video"
          : "document";

    const result = await sendMediaAction(conversationId, {
      kind,
      dataBase64: selectedFile.base64,
      mime: selectedFile.mime,
      filename: selectedFile.name,
      caption: selectedFile.caption || undefined,
      replyTo: replyTo?.wamid || undefined,
    });

    setState(result);
    setIsPending(false);

    if (result.ok) {
      setSelectedFile(null);
      onReplyToChange?.(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(",")[1] || "";
      setSelectedFile({
        name: file.name,
        mime: file.type,
        base64,
        caption: "",
      });
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleQuickReplySelect = (qr: QuickReply) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = textarea.value;

      const beforeSlash = currentValue.substring(
        0,
        start - quickReplySearch.length - 1,
      );
      const afterSlash = currentValue.substring(end);

      textarea.value = beforeSlash + qr.body + afterSlash;
      textarea.focus();
      textarea.setSelectionRange(
        beforeSlash.length + qr.body.length,
        beforeSlash.length + qr.body.length,
      );
    }

    setQuickReplySearch("");
    setShowQuickReplyDropdown(false);
    setSelectedQuickReplyIndex(-1);
  };

  const handleEmojiPick = (emoji: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const currentValue = textarea.value;

      const beforeEmoji = currentValue.substring(0, start);
      const afterEmoji = currentValue.substring(start);

      textarea.value = beforeEmoji + emoji + afterEmoji;
      textarea.focus();

      const newCursorPosition = start + emoji.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);

      setHasText(textarea.value.trim().length > 0);
    }
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (showQuickReplyDropdown && filteredQuickReplies.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedQuickReplyIndex((prev) =>
          prev < filteredQuickReplies.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedQuickReplyIndex((prev) =>
          prev > 0 ? prev - 1 : filteredQuickReplies.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleQuickReplySelect(filteredQuickReplies[selectedQuickReplyIndex]);
      } else if (e.key === "Escape") {
        setShowQuickReplyDropdown(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        const formData = new FormData(form);
        handleSendText(formData);
      }
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        const formData = new FormData(form);
        handleSendText(formData);
      }
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    const selectionStart = e.currentTarget.selectionStart;

    setHasText(value.trim().length > 0);

    const lastNewlineIndex = value.lastIndexOf("\n", selectionStart - 1);
    const lineStart = lastNewlineIndex + 1;
    const lineBeforeCursor = value.substring(lineStart, selectionStart);

    if (lineBeforeCursor.startsWith("/") && lineBeforeCursor.length > 1) {
      const search = lineBeforeCursor.substring(1);
      setQuickReplySearch(search);
      setShowQuickReplyDropdown(true);
      setSelectedQuickReplyIndex(0);
    } else {
      setShowQuickReplyDropdown(false);
      setQuickReplySearch("");
    }
  };

  const handleSaveNote = async () => {
    if (!noteBody.trim()) return;
    setNotePending(true);
    const result = await addNoteAction(conversationId, noteBody);
    setNotePending(false);
    if (result.ok) {
      setNoteBody("");
      if (noteTextareaRef.current) noteTextareaRef.current.value = "";
      router.refresh();
    }
  };

  const effectiveMode = windowOpen ? "text" : "template";

  if (effectiveMode === "template") {
    return (
      <TemplateComposer
        templates={templates}
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        templateVars={templateVars}
        setTemplateVars={setTemplateVars}
        onSend={handleSendTemplate}
        isLoading={isTemplatePending}
        state={templateState}
        windowOpen={windowOpen}
      />
    );
  }

  const resultError =
    typeof state === "object" && state !== null && !state.ok && "error" in state
      ? state.error
      : null;

  return (
    <div className="border-t bg-card flex flex-col">
      {/* Tabs */}
      <div className="flex border-b px-4 pt-3">
        <button
          onClick={() => setComposerTab("reply")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            composerTab === "reply"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Responder
        </button>
        <button
          onClick={() => setComposerTab("note")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            composerTab === "note"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Nota privada
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Responder Tab */}
        {composerTab === "reply" && (
          <>
            {replyTo && (
              <div className="rounded-lg border-l-2 border-l-emerald-500 bg-muted/50 dark:bg-muted/30 p-2.5 flex items-start justify-between gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Respondiendo a {replyTo.author === "out" ? "ti" : "Cliente"}
                  </div>
                  <div className="text-sm text-foreground line-clamp-1">
                    {replyTo.label}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onReplyToChange?.(null);
                  }}
                  className="flex-shrink-0 rounded p-0.5 hover:bg-muted transition-colors"
                  title="Cancelar respuesta"
                >
                  <XIcon className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

            {selectedFile && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                    <PaperclipIcon className="size-3.5" /> {selectedFile.name}
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    <XIcon className="size-3.5 text-amber-700 dark:text-amber-400" />
                  </button>
                </div>
                {selectedFile.mime.startsWith("image/") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${selectedFile.mime};base64,${selectedFile.base64}`}
                    alt={selectedFile.name}
                    className="max-h-48 w-auto rounded-md border border-amber-200 object-contain dark:border-amber-900/30"
                  />
                )}
                {selectedFile.mime.startsWith("video/") && (
                  <video
                    src={`data:${selectedFile.mime};base64,${selectedFile.base64}`}
                    controls
                    className="max-h-48 w-auto rounded-md border border-amber-200 dark:border-amber-900/30"
                  />
                )}
                {selectedFile.mime.startsWith("audio/") && (
                  <audio
                    src={`data:${selectedFile.mime};base64,${selectedFile.base64}`}
                    controls
                    className="w-full"
                  />
                )}
                {(selectedFile.mime.startsWith("image/") ||
                  selectedFile.mime.startsWith("video/")) && (
                  <input
                    type="text"
                    placeholder="Añadir texto (opcional)"
                    value={selectedFile.caption}
                    onChange={(e) =>
                      setSelectedFile({
                        ...selectedFile,
                        caption: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1.5 text-xs rounded border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
            )}

            {selectedFile ? (
              <button
                onClick={handleSendMedia}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Enviando…" : "Enviar archivo"}
                {!isPending && <SendIcon className="size-3.5" />}
              </button>
            ) : (
              <form
                className="space-y-3"
                data-composer="text"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hasText) handleSendText(new FormData(e.currentTarget));
                }}
              >
                <div className="relative">
                  {/* Unified composer bar */}
                  <div className="flex items-end gap-1 rounded-2xl border bg-background px-2 py-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="*/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPending || !windowOpen}
                      aria-label="Adjuntar archivo"
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                    >
                      <PaperclipIcon className="size-4" />
                    </button>
                    <StickerPicker
                      conversationId={conversationId}
                      stickers={stickers}
                      disabled={isPending || !windowOpen}
                      replyToWamid={replyTo?.wamid}
                    />
                    <EmojiPicker
                      onPick={handleEmojiPick}
                      disabled={isPending || !windowOpen}
                    />
                    <textarea
                      ref={textareaRef}
                      name="message"
                      placeholder="Escribe un mensaje…  ( / para respuestas rápidas )"
                      disabled={isPending}
                      onKeyDown={handleTextareaKeyDown}
                      onChange={handleTextareaChange}
                      className="flex-1 max-h-32 resize-none border-0 bg-transparent px-1 py-2 text-sm focus:outline-none focus:ring-0 disabled:opacity-50 placeholder-muted-foreground"
                      rows={1}
                    />
                    {selectedFile ? (
                      <button
                        type="button"
                        onClick={handleSendMedia}
                        disabled={isPending}
                        aria-label="Enviar archivo"
                        className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <SendIcon className="size-4" />
                      </button>
                    ) : hasText ? (
                      <button
                        type="submit"
                        disabled={isPending}
                        aria-label="Enviar mensaje (⌘+Enter)"
                        className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        <SendIcon className="size-4" />
                      </button>
                    ) : (
                      <VoiceRecorder
                        disabled={isPending || !windowOpen}
                        onSend={async (dataBase64, mime) => {
                          setIsPending(true);
                          const result = await sendVoiceAction(conversationId, {
                            dataBase64,
                            mime,
                            replyTo: replyTo?.wamid,
                          });
                          setState(result);
                          setIsPending(false);
                          if (result.ok) {
                            router.refresh();
                            onReplyToChange?.(null);
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Quick reply dropdown */}
                  {showQuickReplyDropdown &&
                    filteredQuickReplies.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-background shadow-lg z-10 max-h-48 overflow-y-auto">
                        {filteredQuickReplies.map((qr, idx) => (
                          <button
                            key={qr.id}
                            type="button"
                            onClick={() => handleQuickReplySelect(qr)}
                            className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 transition-colors ${
                              idx === selectedQuickReplyIndex
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted"
                            }`}
                          >
                            <div className="font-medium">/{qr.shortcut}</div>
                            <div className="text-muted-foreground line-clamp-1">
                              {qr.body}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {resultError && (
                  <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                    {resultError}
                  </div>
                )}
              </form>
            )}
          </>
        )}

        {/* Nota privada Tab */}
        {composerTab === "note" && (
          <div className="space-y-2">
            <textarea
              ref={noteTextareaRef}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Escribe una nota interna… (solo tu equipo la ve)"
              aria-label="Nota interna"
              className="w-full px-3 py-2 text-sm rounded-lg border-0 bg-amber-50/40 dark:bg-amber-950/15 focus:outline-none focus:ring-0 resize-none"
              rows={4}
            />
            <button
              onClick={handleSaveNote}
              disabled={notePending || !noteBody.trim()}
              className="w-full px-3 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {notePending ? "Guardando…" : "Guardar nota"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateComposer({
  templates,
  selectedTemplate,
  setSelectedTemplate,
  templateVars,
  setTemplateVars,
  onSend,
  isLoading,
  state,
  windowOpen,
}: {
  templates: Template[];
  selectedTemplate: Template | null;
  setSelectedTemplate: (t: Template | null) => void;
  templateVars: string[];
  setTemplateVars: (vars: string[]) => void;
  onSend: () => Promise<SendResult>;
  isLoading: boolean;
  state: SendResult | null;
  windowOpen: boolean;
}) {
  const resultError =
    typeof state === "object" && state !== null && !state.ok && "error" in state
      ? state.error
      : null;

  const [templateQuery, setTemplateQuery] = useState("");
  const visibleTemplates = templateQuery.trim()
    ? templates.filter((t) =>
        `${t.name} ${t.bodyText}`.toLowerCase().includes(templateQuery.trim().toLowerCase()),
      )
    : templates;

  return (
    <div className="border-t p-4 bg-card space-y-3">
      {!windowOpen && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 rounded-md border border-amber-200 dark:border-amber-900/30">
          La ventana de 24h está cerrada. Solo puedes enviar plantillas
          aprobadas.
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Plantilla</label>
          {selectedTemplate && (
            <button
              type="button"
              onClick={() => {
                setSelectedTemplate(null);
                setTemplateVars([]);
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Cambiar plantilla
            </button>
          )}
        </div>

        {selectedTemplate ? (
          <div className="rounded-lg border border-primary/40 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{selectedTemplate.name}</span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {selectedTemplate.language}
              </span>
            </div>
            <div className="mt-1.5 rounded-md rounded-tl-none bg-emerald-50 px-2.5 py-2 text-xs leading-snug text-foreground/90 dark:bg-emerald-950/40">
              {selectedTemplate.bodyText || "(sin vista previa)"}
            </div>
          </div>
        ) : (
          <>
            {templates.length > 4 && (
              <input
                type="text"
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                placeholder="Buscar plantilla…"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
            {visibleTemplates.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {templates.length === 0
                  ? "No tienes plantillas aprobadas todavía."
                  : "Ninguna plantilla coincide con la búsqueda."}
              </p>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {visibleTemplates.map((t) => (
                  <button
                    key={`${t.name}|${t.language}`}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(t);
                      setTemplateVars(Array(t.varCount).fill(""));
                    }}
                    className="rounded-lg border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{t.name}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t.language}
                      </span>
                    </div>
                    <div className="mt-1.5 line-clamp-3 rounded-md rounded-tl-none bg-emerald-50 px-2 py-1.5 text-[11px] leading-snug text-foreground/80 dark:bg-emerald-950/40">
                      {t.bodyText || "(sin vista previa)"}
                    </div>
                    {t.varCount > 0 && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {t.varCount} variable{t.varCount === 1 ? "" : "s"} para completar
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedTemplate && selectedTemplate.varCount > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium">Variables</label>
          {Array.from({ length: selectedTemplate.varCount }).map((_, i) => (
            <input
              key={i}
              type="text"
              placeholder={`Variable ${i + 1}`}
              value={templateVars[i] ?? ""}
              onChange={(e) => {
                const newVars = [...templateVars];
                newVars[i] = e.target.value;
                setTemplateVars(newVars);
              }}
              className="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ))}
        </div>
      )}

      {resultError && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {resultError}
        </div>
      )}

      <button
        onClick={onSend}
        disabled={isLoading || !selectedTemplate}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "Enviando…" : "Enviar plantilla"}
        {!isLoading && <SendIcon className="size-3.5" />}
      </button>
    </div>
  );
}
