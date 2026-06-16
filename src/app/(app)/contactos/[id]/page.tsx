import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { getContactAction, listTagsAction } from "../actions";
import { FichaContacto } from "./_ficha";

export const dynamic = "force-dynamic";

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactAction(id);
  if (!contact) notFound();
  const allTags = await listTagsAction();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/contactos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Volver a contactos
      </Link>

      <FichaContacto contact={contact} allTags={allTags} />

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Conversación</h2>
        {contact.conversation ? (
          <Link
            href={`/inbox/${contact.conversation.id}`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <MessageCircleIcon className="size-4" />
            Abrir conversación en el inbox
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Sin conversación todavía.</p>
        )}
      </section>

      <section className="rounded-lg border border-dashed p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <PhoneIcon className="size-4" />
          Llamadas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El historial de llamadas aparecerá aquí cuando se active la Calling API.
        </p>
      </section>
    </div>
  );
}
