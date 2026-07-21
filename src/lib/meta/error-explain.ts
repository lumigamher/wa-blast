/**
 * Traduce errores de la API de WhatsApp (Meta) a lenguaje claro para el
 * equipo comercial. El detalle técnico original se conserva aparte.
 */
const RULES: { match: RegExp; explain: string }[] = [
  {
    match: /131047|re-?engagement|24 ?h/i,
    explain:
      "Han pasado más de 24 horas desde el último mensaje del cliente. Solo puedes escribirle con una plantilla aprobada.",
  },
  {
    match: /131026|undeliverable|not a valid whatsapp user|recipient/i,
    explain:
      "El número no puede recibir el mensaje: puede que no tenga WhatsApp o que haya bloqueado este número.",
  },
  {
    match: /131049|marketing.*limit|per-user marketing/i,
    explain:
      "Meta limitó por ahora los mensajes de marketing a este número. Intenta de nuevo más tarde.",
  },
  {
    match: /132000|number of parameters|param.*mismatch/i,
    explain:
      "La plantilla se envió con variables de más o de menos. Revisa que cada variable tenga su valor.",
  },
  {
    match: /132001|template.*(not exist|does not exist)|nombre de plantilla/i,
    explain: "La plantilla no existe o no está aprobada en ese idioma.",
  },
  {
    match: /132015|template.*paused/i,
    explain: "Meta pausó esta plantilla por bajo desempeño. Usa otra plantilla.",
  },
  {
    match: /131042|payment|método de pago/i,
    explain:
      "Hay un problema con el método de pago de la cuenta de WhatsApp. Revisa la facturación en Meta Business.",
  },
  {
    match: /131056|pair rate|too many messages.*(pair|user)/i,
    explain:
      "Se enviaron demasiados mensajes a este número en poco tiempo. Espera unos minutos y reintenta.",
  },
  {
    match: /131048|spam rate|quality/i,
    explain:
      "Meta está limitando los envíos de la cuenta por posibles reportes de spam. Baja el ritmo de envíos.",
  },
  {
    match: /131051|unsupported message type/i,
    explain: "Ese tipo de mensaje no es compatible con WhatsApp.",
  },
  {
    match: /\(#190\)|access token|token.*(expired|invalid)/i,
    explain:
      "La conexión con WhatsApp expiró. Vuelve a conectar la cuenta en Configuración → Meta.",
  },
  {
    match: /\(#10\)|permission|not authorized/i,
    explain:
      "La cuenta de WhatsApp no tiene permiso para esta acción. Revisa la configuración en Meta Business.",
  },
  {
    match: /\(#100\)|invalid parameter/i,
    explain: "Algún dato del mensaje no es válido para WhatsApp.",
  },
  {
    match: /media|attachment|file size/i,
    explain: "El archivo adjunto no pudo procesarse (formato o tamaño no aceptado por WhatsApp).",
  },
];

export function explainMetaError(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "No se pudo entregar el mensaje.";
  for (const r of RULES) {
    if (r.match.test(raw)) return r.explain;
  }
  return "No se pudo entregar el mensaje.";
}
