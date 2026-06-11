"use client";

import { useState, useRef, useMemo } from "react";
import { SendIcon, ChevronDownIcon, PaperclipIcon, XIcon } from "lucide-react";
import { sendMessageAction, sendMediaAction, type SendResult } from "../../actions";

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

type ComposerProps = {
  conversationId: string;
  windowOpen: boolean;
  templates: Template[];
  quickReplies: QuickReply[];
  replyTo?: string | null;
  onReplyToChange?: (wamid: string | null) => void;
};

export function Composer({
  conversationId,
  windowOpen,
  templates,
  quickReplies,
  replyTo: initialReplyTo = null,
  onReplyToChange,
}: ComposerProps) {
  const [mode, setMode] = useState<"text" | "template">("text");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<SendResult | null>(null);
  const [isTemplatePending, setIsTemplatePending] = useState(false);
  const [templateState, setTemplateState] = useState<SendResult | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(initialReplyTo);
  const [selectedFile, setSelectedFile] = useState<{ name: string; mime: string; base64: string; caption: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [showQuickReplyDropdown, setShowQuickReplyDropdown] = useState(false);
  const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(-1);

  const filteredQuickReplies = useMemo(() => {
    if (!quickReplySearch) return [];
    return quickReplies.filter(
      (qr) =>
        qr.shortcut.toLowerCase().includes(quickReplySearch.toLowerCase()) ||
        qr.body.toLowerCase().includes(quickReplySearch.toLowerCase())
    );
  }, [quickReplySearch, quickReplies]);

  const handleSendText = async (formData: FormData) => {
    const body = formData.get("message") as string;
    if (!body?.trim()) {
      setState({ ok: false, error: "Escribe un mensaje" });
      return;
    }
    setIsPending(true);
    const result = await sendMessageAction(conversationId, body, replyTo ? { replyTo } : undefined);
    setState(result);
    setIsPending(false);
    if (result.ok) {
      const form = document.querySelector(
        'form[data-composer="text"]'
      ) as HTMLFormElement;
      if (form) form.reset();
      setReplyTo(null);
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
    const { sendTemplateToConversationAction } = await import("../../actions");
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
      replyTo: replyTo || undefined,
    });

    setState(result);
    setIsPending(false);

    if (result.ok) {
      setSelectedFile(null);
      setReplyTo(null);
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

      const beforeSlash = currentValue.substring(0, start - quickReplySearch.length - 1);
      const afterSlash = currentValue.substring(end);

      textarea.value = beforeSlash + qr.body + afterSlash;
      textarea.focus();
      textarea.setSelectionRange(
        beforeSlash.length + qr.body.length,
        beforeSlash.length + qr.body.length
      );
    }

    setQuickReplySearch("");
    setShowQuickReplyDropdown(false);
    setSelectedQuickReplyIndex(-1);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showQuickReplyDropdown && filteredQuickReplies.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedQuickReplyIndex((prev) =>
          prev < filteredQuickReplies.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedQuickReplyIndex((prev) =>
          prev > 0 ? prev - 1 : filteredQuickReplies.length - 1
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
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    const selectionStart = e.currentTarget.selectionStart;

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

  const effectiveMode = windowOpen ? mode : "template";

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
    <div className="border-t p-4 bg-card space-y-3">
      {replyTo && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 p-2.5 flex items-center justify-between">
          <div className="text-xs text-blue-700 dark:text-blue-400">
            Respondiendo a un mensaje
          </div>
          <button
            onClick={() => {
              setReplyTo(null);
              onReplyToChange?.(null);
            }}
            className="rounded p-0.5 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
          >
            <XIcon className="size-3.5 text-blue-700 dark:text-blue-400" />
          </button>
        </div>
      )}

      {selectedFile && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              📎 {selectedFile.name}
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
            >
              <XIcon className="size-3.5 text-amber-700 dark:text-amber-400" />
            </button>
          </div>
          {(selectedFile.mime.startsWith("image/") || selectedFile.mime.startsWith("video/")) && (
            <input
              type="text"
              placeholder="Añadir texto (opcional)"
              value={selectedFile.caption}
              onChange={(e) =>
                setSelectedFile({ ...selectedFile, caption: e.target.value })
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
        <form className="space-y-2" data-composer="text" onSubmit={(e) => { e.preventDefault(); handleSendText(new FormData(e.currentTarget)); }}>
          <div className="relative">
            <textarea
              ref={textareaRef}
              name="message"
              placeholder="Escribe tu mensaje... (Shift+Enter para nueva línea, / para respuestas rápidas)"
              disabled={isPending}
              onKeyDown={handleTextareaKeyDown}
              onChange={handleTextareaChange}
              className="w-full px-3 py-2 text-sm rounded-md border bg-background disabled:opacity-50 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
            />

            {showQuickReplyDropdown && filteredQuickReplies.length > 0 && (
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
                    <div className="text-muted-foreground line-clamp-1">{qr.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {resultError && (
            <div className="text-xs text-red-600 dark:text-red-400">{resultError}</div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                title="Adjuntar archivo"
              >
                <PaperclipIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setMode("template")}
                className="text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted transition-colors"
                disabled={isPending}
              >
                Usar plantilla
              </button>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Enviando…" : "Enviar"}
              {!isPending && <SendIcon className="size-3.5" />}
            </button>
          </div>
        </form>
      )}
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

  return (
    <div className="border-t p-4 bg-card space-y-3">
      {!windowOpen && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 rounded-md border border-amber-200 dark:border-amber-900/30">
          La ventana de 24h está cerrada. Solo puedes enviar plantillas aprobadas.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium">Plantilla</label>
        <div className="relative">
          <select
            value={selectedTemplate ? JSON.stringify(selectedTemplate) : ""}
            onChange={(e) => {
              if (e.target.value) {
                const t = JSON.parse(e.target.value);
                setSelectedTemplate(t);
                setTemplateVars(Array(t.varCount).fill(""));
              }
            }}
            className="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary appearance-none pr-8"
          >
            <option value="">Elige una plantilla…</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={JSON.stringify(t)}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        </div>
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
        <div className="text-xs text-red-600 dark:text-red-400">{resultError}</div>
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
