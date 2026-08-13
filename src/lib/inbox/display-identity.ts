/**
 * Cómo se nombra a una persona en la interfaz.
 *
 * Un usuario con username puede no tener teléfono nunca, así que la UI no puede
 * asumir que hay número que mostrar. Este helper es el único lugar que decide,
 * para que las pantallas no repitan la cadena de fallbacks.
 */
export function displayIdentity(p: {
  name?: string | null;
  username?: string | null;
  phone?: string | null;
  bsuid?: string | null;
}): string {
  const limpio = (v?: string | null) => (v && v.trim() ? v.trim() : null);

  const name = limpio(p.name);
  if (name) return name;

  const username = limpio(p.username);
  if (username) return username.startsWith("@") ? username : `@${username}`;

  const phone = limpio(p.phone);
  if (phone) return phone;

  // El BSUID entero es ilegible ("US.13491208655302741918"): se abrevia dejando
  // el país y la cola, que basta para distinguir dos conversaciones.
  const bsuid = limpio(p.bsuid);
  if (bsuid) {
    const [pais, ...resto] = bsuid.split(".");
    const id = resto.join(".");
    return id.length > 5 ? `${pais}.…${id.slice(-5)}` : bsuid;
  }

  return "Sin identificar";
}
