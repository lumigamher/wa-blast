import Link from "next/link";

export default function ConfigIndex() {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <ul className="list-disc pl-6 space-y-1">
        <li><Link className="underline" href="/configuracion/meta">Meta WhatsApp credenciales</Link></li>
      </ul>
    </div>
  );
}
