"use client";

import { useState } from "react";
import { SendIcon, ChevronDownIcon } from "lucide-react";
import { sendMessageAction, sendTemplateToConversationAction, type SendResult } from "../../actions";

type Template = {
  name: string;
  language: string;
  bodyText: string;
  varCount: number;
};

type ComposerProps = {
  conversationId: string;
  windowOpen: boolean;
  templates: Template[];
};

export function Composer({
  conversationId,
  windowOpen,
  templates,
}: ComposerProps) {
  const [mode, setMode] = useState<"text" | "template">(
    windowOpen ? "text" : "template"
  );
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<SendResult | null>(null);
  const [isTemplatePending, setIsTemplatePending] = useState(false);
  const [templateState, setTemplateState] = useState<SendResult | null>(null);

  const handleSendText = async (formData: FormData) => {
    const body = formData.get("message") as string;
    if (!body?.trim()) {
      setState({ ok: false, error: "Escribe un mensaje" });
      return;
    }
    setIsPending(true);
    const result = await sendMessageAction(conversationId, body);
    setState(result);
    setIsPending(false);
    if (result.ok) {
      // Reset form
      const form = document.querySelector(
        'form[data-composer="text"]'
      ) as HTMLFormElement;
      if (form) form.reset();
    }
  };

  const handleSendTemplate = async (): Promise<SendResult> => {
    if (!selectedTemplate) {
      const err = { ok: false, error: "Selecciona una plantilla" } as const;
      setTemplateState(err);
      return err;
    }
    setIsTemplatePending(true);
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

  // When window closes, switch to template mode
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

  return (
    <TextComposer
      handleSendText={handleSendText}
      isPending={isPending}
      state={state}
      onSwitchToTemplate={() => setMode("template")}
    />
  );
}

function TextComposer({
  handleSendText,
  isPending,
  state,
  onSwitchToTemplate,
}: {
  handleSendText: (formData: FormData) => Promise<void>;
  isPending: boolean;
  state: SendResult | null;
  onSwitchToTemplate: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        const formData = new FormData(form);
        handleSendText(formData);
      }
    }
  };

  const resultError =
    typeof state === "object" && state !== null && !state.ok && "error" in state
      ? state.error
      : null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    handleSendText(formData);
  };

  return (
    <div className="border-t p-4 bg-card space-y-3">
      <form className="space-y-2" data-composer="text" onSubmit={handleSubmit}>
        <textarea
          name="message"
          placeholder="Escribe tu mensaje... (Shift+Enter para nueva línea)"
          disabled={isPending}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 text-sm rounded-md border bg-background disabled:opacity-50 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
        />
        {resultError && (
          <div className="text-xs text-red-600 dark:text-red-400">{resultError}</div>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onSwitchToTemplate}
            className="text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted transition-colors"
            disabled={isPending}
          >
            Usar plantilla
          </button>
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
