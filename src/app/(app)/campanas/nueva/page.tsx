import { listSegmentsAction } from "../../contactos/segmentos/actions";
import { createFromSegmentAction } from "./actions";

export default async function NuevaCampanaPage() {
  const segs = await listSegmentsAction();
  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Nueva campaña</h1>
      <form action={createFromSegmentAction} className="space-y-3">
        <Field label="Nombre" name="name" />
        <label className="block">
          <span className="text-sm">Segmento</span>
          <select name="segmentId" className="mt-1 block w-full rounded border px-3 py-2">
            {segs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Plantilla (nombre)" name="templateName" />
        <Field label="Idioma" name="templateLanguage" defaultValue="es" />
        <Field
          label="Params (coma-sep, usa {{name}} o {{custom.city}})"
          name="paramsCsv"
          placeholder="{{name}}, {{custom.city}}"
        />
        <button className="rounded bg-primary text-primary-foreground px-4 py-2">Crear y enviar</button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue = "",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 block w-full rounded border px-3 py-2"
      />
    </label>
  );
}
