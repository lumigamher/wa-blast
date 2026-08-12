import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { conversations } from "@/lib/db/schema";
import { getMediaAsset } from "@/lib/media/store";
import { sendMedia, uploadMedia } from "@/lib/meta/client";
import { recordOutboundMedia } from "./_record-outbound";
import { getOrgSettings } from "@/lib/org/settings";
import { listPaymentMethods } from "../../payments/methods";
import type { AgentTool } from "../types";

const schema = z.object({
	type: z.string().optional(),
	methodId: z.string().optional(),
});

export const enviarQrPago: AgentTool = {
	name: "enviar_qr_pago",
	description:
		"Envía al cliente el código QR de un medio de pago por WhatsApp. Úsalo cuando el cliente elige cómo pagar y ese medio tiene QR.",
	paramsSchema: schema,
	jsonSchema: {
		type: "object",
		properties: {
			type: {
				type: "string",
				description:
					"Tipo de medio (nequi, daviplata, bre_b, transferencia, link)",
			},
			methodId: {
				type: "string",
				description: "ID específico del método de pago (opcional si hay type)",
			},
		},
	},
	escalates: false,
	async run(args, ctx) {
		const { type, methodId } = schema.parse(args);

		// Load payment methods
		const methods = await listPaymentMethods(ctx.db, ctx.orgId, true);
		if (methods.length === 0) {
			return { ok: false, error: "No hay métodos de pago configurados" };
		}

		// Pick method: by methodId, else by type, else first with QR
		const selectedMethod = methods.find(
			(m) =>
				(methodId && m.id === methodId && m.qrMediaAssetId) ||
				(type &&
					m.type.toLowerCase() === type.toLowerCase() &&
					m.qrMediaAssetId) ||
				(!methodId && !type && m.qrMediaAssetId),
		);

		if (!selectedMethod?.qrMediaAssetId) {
			return { ok: false, error: "Ese medio no tiene QR configurado" };
		}

		// Load settings and get conversation phone
		const settings = await getOrgSettings(ctx.db, ctx.orgId);

		const [convRow] = await ctx.db
			.select()
			.from(conversations)
			.where(eq(conversations.id, ctx.conversationId));
		if (!convRow) {
			return { ok: false, error: "Conversación sin teléfono" };
		}
		const phone = convRow.phone;

		// Load asset
		const asset = await getMediaAsset(ctx.db, selectedMethod.qrMediaAssetId);
		if (!asset || asset.orgId !== ctx.orgId) {
			return { ok: false, error: "QR no encontrado o no autorizado" };
		}

		// Read file
		let bytes: ArrayBuffer;
		try {
			const buf = await readFile(asset.path);
			bytes = buf.buffer.slice(
				buf.byteOffset,
				buf.byteOffset + buf.byteLength,
			) as ArrayBuffer;
		} catch {
			return { ok: false, error: "No pude leer el QR" };
		}

		// Upload media to Meta
		const uploadResult = await uploadMedia(settings, {
			bytes,
			mime: asset.mime,
		});
		if ("error" in uploadResult) {
			return { ok: false, error: uploadResult.error.message };
		}

		// Send media
		const sendResult = await sendMedia(settings, {
			to: phone,
			kind: "image",
			mediaId: uploadResult.mediaId,
			caption: `QR - ${selectedMethod.label}`,
		});
		if ("error" in sendResult) {
			return { ok: false, error: sendResult.error.message };
		}

		await recordOutboundMedia(ctx.db, {
			orgId: ctx.orgId,
			conversationId: ctx.conversationId,
			wamid: sendResult.wamid,
			bytes,
			mime: asset.mime,
			kind: "image",
			caption: `QR - ${selectedMethod.label}`,
		});

		return { ok: true, data: { enviado: true } };
	},
};
