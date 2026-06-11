# Onboarding manual de un cliente (v1)

1. El cliente entra a https://luladev.com/signup y se registra (su org se crea sola)
   — o tú lo invitas desde /configuracion/equipo de una org que creas para él.
2. El cliente (o tú) carga sus credenciales Meta en /configuracion/meta
   (phone ID, WABA ID, App ID, access token, app secret — cifradas por-org).
3. Pago: el cliente paga en /facturacion (EfiPay) → se activa solo.
   Pago por fuera (Nequi/transferencia): /admin → su org → "+30 días".
4. Verificar en /salud que la conexión Meta responde.

## Env de producción (server: /opt/wa-blast/.env.local — NUNCA por rsync)

```
NODE_ENV=production
DATABASE_URL=/var/lib/wa-blast/data.db
MEDIA_DIR=/var/lib/wa-blast/media
BETTER_AUTH_SECRET=   # openssl rand -base64 48
BETTER_AUTH_URL=https://luladev.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://luladev.com
PUBLIC_BASE_URL=https://luladev.com
ENCRYPTION_KEY=       # openssl rand -base64 32 (32 bytes exactos)
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_EMAILS=
EFIPAY_API_TOKEN=    # entre comillas si contiene | (formato 942|...)
EFIPAY_OFFICE_ID=4279  # Entero. GET /api/v1/offices/get para obtener el office_id correcto (requiere token EfiPay)
EFIPAY_WEBHOOK_TOKEN=  # Token de webhooks del dashboard EfiPay (Documentación → token para webhooks)
EFIPAY_BASE_URL=https://sag.efipay.co/api/v1  # Por defecto. Cambiar si EfiPay lo requiere
OPENAI_API_KEY=       # opcional, para Generar Flow con IA
OPENAI_MODEL=gpt-4-mini

# Si hay que crear datos con mejor-auth de facto, DISABLE_SIGNUP puede usarse
# DISABLE_SIGNUP=false
```
