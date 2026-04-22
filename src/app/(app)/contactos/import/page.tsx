"use client";

import {
	ArrowLeftIcon,
	CheckCircle2Icon,
	FileSpreadsheetIcon,
	UploadIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { commitImportAction, validateImportAction } from "../actions";

type ExcelRow = Record<string, string>;
type Preview = Awaited<ReturnType<typeof validateImportAction>>;

const NONE = "__none__";

export default function ImportPage() {
	const router = useRouter();
	const [fileName, setFileName] = useState<string>("");
	const [rows, setRows] = useState<ExcelRow[]>([]);
	const [headers, setHeaders] = useState<string[]>([]);
	const [phoneCol, setPhoneCol] = useState<string>("");
	const [nameCol, setNameCol] = useState<string>("");
	const [emailCol, setEmailCol] = useState<string>("");
	const [preview, setPreview] = useState<Preview | null>(null);
	const [isPending, startTransition] = useTransition();

	async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const buf = await file.arrayBuffer();
			const wb = read(buf);
			const sheet = wb.Sheets[wb.SheetNames[0]];
			const json = utils.sheet_to_json<ExcelRow>(sheet, {
				defval: "",
				raw: false,
			});
			if (json.length === 0) {
				toast.error("El archivo está vacío");
				return;
			}
			const cols = Object.keys(json[0] as ExcelRow);
			const guessPhone =
				cols.find((c) => /tel|phone|cel|whats/i.test(c)) ?? cols[0];
			const guessName = cols.find((c) => /nombre|name/i.test(c)) ?? "";
			const guessEmail = cols.find((c) => /email|correo|mail/i.test(c)) ?? "";

			setFileName(file.name);
			setRows(json);
			setHeaders(cols);
			setPhoneCol(guessPhone);
			setNameCol(guessName);
			setEmailCol(guessEmail);
			setPreview(null);
		} catch (err) {
			console.error(err);
			toast.error("No pude leer el archivo. ¿Está en formato Excel/CSV?");
		}
	}

	function handleValidate() {
		if (!phoneCol) {
			toast.error("Selecciona la columna de teléfono");
			return;
		}
		startTransition(async () => {
			try {
				const res = await validateImportAction(rows, {
					phoneCol,
					nameCol: nameCol || undefined,
					emailCol: emailCol || undefined,
					customCols: [],
				});
				setPreview(res);
				if (res.valid.length === 0) {
					toast.warning(
						"No encontré contactos válidos. Revisa el mapeo de columnas.",
					);
				}
			} catch (err) {
				console.error(err);
				toast.error("No pude validar. Intenta de nuevo.");
			}
		});
	}

	function handleConfirm() {
		startTransition(async () => {
			try {
				const res = await commitImportAction(rows, {
					phoneCol,
					nameCol: nameCol || undefined,
					emailCol: emailCol || undefined,
					customCols: [],
				});
				const created = res.totalValid;
				toast.success(`Importados ${created} contactos`);
				router.push("/contactos");
			} catch (err) {
				console.error(err);
				toast.error("No pude importar. Intenta de nuevo.");
			}
		});
	}

	function reset() {
		setFileName("");
		setRows([]);
		setHeaders([]);
		setPhoneCol("");
		setNameCol("");
		setEmailCol("");
		setPreview(null);
	}

	const hasFile = headers.length > 0;

	return (
		<div className="space-y-6">
			<header className="space-y-2">
				<Link
					href="/contactos"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
				>
					<ArrowLeftIcon className="size-3" /> Contactos
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight">
					Importar contactos
				</h1>
				<p className="text-sm text-muted-foreground">
					Sube un CSV o Excel. Auto-detectamos las columnas y puedes ajustarlas
					antes de confirmar. Los duplicados se actualizan sin sobrescribir
					opt-outs.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">1 · Sube el archivo</CardTitle>
					<CardDescription className="text-xs">
						La primera fila debe ser el encabezado con los nombres de columna.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-6 text-sm transition-colors hover:bg-muted/30">
						{hasFile ? (
							<FileSpreadsheetIcon className="size-6 text-emerald-600" />
						) : (
							<UploadIcon className="size-6 text-muted-foreground" />
						)}
						<div className="flex-1">
							{hasFile ? (
								<div>
									<div className="font-medium">{fileName}</div>
									<div className="text-xs text-muted-foreground">
										{rows.length} filas · {headers.length} columnas
									</div>
								</div>
							) : (
								<div className="text-muted-foreground">
									Haz click o arrastra tu archivo .csv / .xlsx
								</div>
							)}
						</div>
						{hasFile && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={(e) => {
									e.preventDefault();
									reset();
								}}
							>
								Cambiar
							</Button>
						)}
						<Input
							type="file"
							accept=".csv,.xlsx,.xls"
							className="hidden"
							onChange={onFile}
						/>
					</label>
				</CardContent>
			</Card>

			{hasFile && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">2 · Mapea las columnas</CardTitle>
						<CardDescription className="text-xs">
							Detectamos automáticamente las columnas. Ajusta si no es correcto.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-1.5">
								<Label>
									Teléfono <span className="text-red-600">*</span>
								</Label>
								<Select
									value={phoneCol}
									onValueChange={(v) => setPhoneCol(v ?? "")}
								>
									<SelectTrigger>
										<SelectValue placeholder="Elige columna…" />
									</SelectTrigger>
									<SelectContent>
										{headers.map((h) => (
											<SelectItem key={h} value={h}>
												{h}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label>Nombre</Label>
								<Select
									value={nameCol || NONE}
									onValueChange={(v) => setNameCol(!v || v === NONE ? "" : v)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>— Ninguna —</SelectItem>
										{headers.map((h) => (
											<SelectItem key={h} value={h}>
												{h}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label>Email</Label>
								<Select
									value={emailCol || NONE}
									onValueChange={(v) => setEmailCol(!v || v === NONE ? "" : v)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>— Ninguna —</SelectItem>
										{headers.map((h) => (
											<SelectItem key={h} value={h}>
												{h}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="overflow-hidden rounded-md border">
							<div className="bg-muted/50 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
								Vista previa · primeras 5 filas
							</div>
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead className="bg-muted/30">
										<tr>
											{headers.map((h) => (
												<th
													key={h}
													className={`text-left px-3 py-1.5 font-medium whitespace-nowrap ${
														h === phoneCol
															? "bg-emerald-50 text-emerald-900"
															: h === nameCol || h === emailCol
																? "bg-blue-50 text-blue-900"
																: ""
													}`}
												>
													{h}
													{h === phoneCol && (
														<span className="ml-1 text-[10px]">· tel</span>
													)}
													{h === nameCol && (
														<span className="ml-1 text-[10px]">· nombre</span>
													)}
													{h === emailCol && (
														<span className="ml-1 text-[10px]">· email</span>
													)}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{rows.slice(0, 5).map((r, i) => (
											<tr key={i} className="border-t">
												{headers.map((h) => (
													<td
														key={h}
														className="px-3 py-1.5 text-muted-foreground whitespace-nowrap"
													>
														{String(r[h] ?? "").slice(0, 40) || "—"}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{hasFile && !preview && (
				<div className="flex justify-end">
					<Button onClick={handleValidate} disabled={isPending || !phoneCol}>
						{isPending ? "Analizando…" : "Previsualizar"}
					</Button>
				</div>
			)}

			{preview && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">3 · Revisa y confirma</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-3 gap-3">
							<Stat
								label="Válidos"
								value={preview.valid.length}
								icon={<CheckCircle2Icon className="size-4 text-emerald-600" />}
							/>
							<Stat
								label="Inválidos"
								value={preview.invalid.length}
								icon={<XCircleIcon className="size-4 text-red-600" />}
							/>
							<Stat label="Duplicados" value={preview.duplicateCount} />
						</div>

						{preview.invalid.length > 0 && (
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="mb-2 text-xs font-medium">
									Filas inválidas (primeras 5)
								</div>
								<ul className="space-y-1 text-xs text-muted-foreground">
									{preview.invalid.slice(0, 5).map((inv, i) => (
										<li key={i} className="flex items-center gap-2">
											<XCircleIcon className="size-3 shrink-0 text-red-600" />
											<span className="font-mono">
												{String(inv.row[phoneCol] ?? "(vacío)")}
											</span>
											<span>·</span>
											<span>{inv.reason}</span>
										</li>
									))}
								</ul>
							</div>
						)}

						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setPreview(null)}
								disabled={isPending}
							>
								Volver
							</Button>
							<Button
								onClick={handleConfirm}
								disabled={isPending || preview.valid.length === 0}
							>
								{isPending
									? "Importando…"
									: `Importar ${preview.valid.length} contactos`}
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Stat({
	label,
	value,
	icon,
}: {
	label: string;
	value: number;
	icon?: React.ReactNode;
}) {
	return (
		<div className="rounded-md border bg-background p-3">
			<div className="flex items-center justify-between">
				<div className="text-[11px] uppercase tracking-wider text-muted-foreground">
					{label}
				</div>
				{icon}
			</div>
			<div className="text-2xl font-semibold tabular-nums">{value}</div>
		</div>
	);
}
