"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { chatwootApi, ChatwootError } from "@/lib/chatwoot";
import { getSession } from "@/lib/session";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Email o contraseña inválidos" };

  let res: Awaited<ReturnType<typeof chatwootApi.signIn>>;
  try {
    res = await chatwootApi.signIn(parsed.data.email, parsed.data.password);
  } catch (e) {
    if (e instanceof ChatwootError && e.status === 401) {
      return { error: "Credenciales incorrectas" };
    }
    return { error: "Error conectando a Chatwoot" };
  }

  if (res.data.role !== "administrator") {
    return { error: "Solo supervisores pueden acceder" };
  }

  const session = await getSession();
  session.user = {
    id: res.data.id,
    name: res.data.available_name ?? res.data.name,
    email: res.data.email,
    role: res.data.role,
    chatwootToken: res.data.access_token,
  };
  await session.save();
  redirect("/");
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
