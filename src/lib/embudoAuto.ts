import { supabase } from "@/lib/supabase";
import { etapaTrasEvento } from "@/lib/embudo";

// Mueve sola a una persona en el embudo al apuntarle una demo o al darla de
// alta como recluta (ver etapaTrasEvento). Si falla no para nada: la demo o
// la recluta ya están guardadas.
export async function moverEnEmbudoTras(contactoId: number | null | undefined, evento: "demo" | "recluta") {
  if (!contactoId) return;
  try {
    const { data } = await supabase.from("contacts").select("estado_lead").eq("id", contactoId).maybeSingle();
    const destino = etapaTrasEvento(data?.estado_lead, evento);
    if (destino) await supabase.from("contacts").update({ estado_lead: destino }).eq("id", contactoId);
  } catch (e) {
    console.error("Error moviendo en el embudo:", e);
  }
}

/** Ficha de contacto de una recluta de Equipo: por su contacto_id o, si no, por teléfono. */
export async function contactoDeRecluta(agente: { contacto_id: number | null; telefono: string | null }): Promise<number | null> {
  if (agente.contacto_id) return agente.contacto_id;
  const digitos = (agente.telefono ?? "").replace(/\D/g, "").slice(-9);
  if (digitos.length < 9) return null;
  const { data } = await supabase.from("contacts").select("id, telefono").ilike("telefono", `%${digitos.slice(-6)}%`);
  const encontrado = (data ?? []).find((c) => (c.telefono ?? "").replace(/\D/g, "").slice(-9) === digitos);
  return encontrado?.id ?? null;
}
