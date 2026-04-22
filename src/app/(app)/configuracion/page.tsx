import Link from "next/link";
import { ChevronRightIcon, KeyIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfigIndex() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes de tu organización y conexión con Meta.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y border-t">
            <ConfigLink
              href="/configuracion/meta"
              icon={<KeyIcon className="size-4 text-blue-600" />}
              title="Meta WhatsApp"
              desc="Phone ID, WABA ID, access token, webhook verify token y forward URL"
            />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">{icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}
