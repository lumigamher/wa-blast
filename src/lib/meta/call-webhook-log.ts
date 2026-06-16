/**
 * TEMPORAL — observabilidad para la verificación de WhatsApp Calling en producción.
 *
 * Loguea el payload CRUDO del webhook cuando contiene contenido de llamada o de
 * permiso de llamada, para confirmar contra Meta las formas exactas que aún no
 * verificamos (reply de permiso, answer saliente, eventos de llamada). El SDP se
 * redacta para no inundar el log.
 *
 * Cómo ver en prod:  journalctl -u wa-blast -f | grep CALL-WEBHOOK
 * QUITAR este helper (y su llamada en route.ts) tras validar la prueba.
 */
export function logCallWebhook(rawBody: string): void {
  if (!/"calls"|call_permission|"call_id"/.test(rawBody)) return;
  try {
    const redacted = rawBody.replace(
      /"sdp":"((?:\\.|[^"\\])*)"/g,
      (_m, body: string) => `"sdp":"[redactado ${body.length} chars]"`,
    );
    console.log("[CALL-WEBHOOK]", redacted.slice(0, 6000));
  } catch {
    /* noop */
  }
}
