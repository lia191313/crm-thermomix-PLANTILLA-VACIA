import { useState, useEffect, useMemo, useCallback } from "react";
import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfDay, startOfMonth, startOfWeek, eachDayOfInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarPlus, User, MapPin, RefreshCw, CalendarDays } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { noProponerLlamar } from "@/lib/marcas";
import { abrirCitaEnGoogleCalendar } from "@/utils/googleCalendar";

// ---------- Tipos de cita ----------
// Demos (tabla demos), bienvenidas (ventas), seguimientos (recordatorios) y
// rellamar salen solos. El resto se apunta aquí y va a la tabla `eventos`.

export type Categoria =
  | "demo" | "bienvenida" | "entrega" | "seguimiento" | "rellamar"
  | "feria" | "clase" | "reunion" | "equipo" | "personal" | "otro";

// Colores como los de su compañera team leader (18/10/2026): verde demos,
// naranja seguimientos/bienvenidas, amarillo talleres, azul delegación,
// lila equipo, rosa personal.
const CATEGORIAS: { id: Categoria; label: string; singular: string; emoji: string; color: string; punto: string }[] = [
  { id: "demo", label: "Demos", singular: "Demo", emoji: "📱", color: "bg-green-100 text-green-800 border-green-300", punto: "bg-green-500" },
  { id: "seguimiento", label: "Seguimientos", singular: "Seguimiento", emoji: "🔔", color: "bg-orange-100 text-orange-800 border-orange-300", punto: "bg-orange-500" },
  { id: "bienvenida", label: "Bienvenidas", singular: "Bienvenida", emoji: "👋", color: "bg-orange-200 text-orange-900 border-orange-400", punto: "bg-orange-600" },
  { id: "rellamar", label: "Rellamar", singular: "Rellamar", emoji: "📞", color: "bg-orange-50 text-orange-700 border-orange-200", punto: "bg-orange-300" },
  { id: "entrega", label: "Entregas", singular: "Entrega", emoji: "📦", color: "bg-orange-100 text-orange-900 border-orange-500", punto: "bg-orange-700" },
  { id: "clase", label: "Talleres y clases", singular: "Taller o clase", emoji: "👩‍🍳", color: "bg-yellow-100 text-yellow-800 border-yellow-300", punto: "bg-yellow-400" },
  { id: "feria", label: "Ferias", singular: "Feria", emoji: "🎪", color: "bg-yellow-200 text-yellow-900 border-yellow-400", punto: "bg-yellow-600" },
  { id: "reunion", label: "Delegación", singular: "Delegación", emoji: "🏢", color: "bg-blue-100 text-blue-800 border-blue-300", punto: "bg-blue-500" },
  { id: "equipo", label: "Equipo", singular: "Equipo", emoji: "🤝", color: "bg-purple-100 text-purple-800 border-purple-300", punto: "bg-purple-500" },
  { id: "personal", label: "Personal", singular: "Personal", emoji: "🌸", color: "bg-pink-100 text-pink-800 border-pink-300", punto: "bg-pink-500" },
  { id: "otro", label: "Otros", singular: "Otro", emoji: "📅", color: "bg-gray-100 text-gray-700 border-gray-300", punto: "bg-gray-400" },
];
export const catInfo = (c: Categoria) => CATEGORIAS.find((x) => x.id === c) ?? CATEGORIAS[CATEGORIAS.length - 1];

// Tipos que se pueden apuntar a mano en "Nueva cita".
const TIPOS_EVENTO: Categoria[] = ["demo", "entrega", "clase", "feria", "reunion", "equipo", "personal", "otro"];

interface EventoRow {
  id: number;
  tipo: Categoria;
  titulo: string;
  inicio: string;
  fin: string | null;
  todo_el_dia: boolean;
  lugar: string | null;
  contacto_id: number | null;
  contacto_ids: number[] | null;
  notas: string | null;
  repeticion: "semanal" | null;
  cada_semanas: number | null;
  repetir_hasta: string | null;
  /** Hecha o anulada, por día ("2026-10-21"): en las que se repiten solo cuenta ese día. */
  estados?: Record<string, EstadoCita> | null;
}

export type EstadoCita = "hecho" | "anulado";

interface Persona {
  id: number;
  nombre: string;
}

const idsDe = (e: EventoRow): number[] =>
  e.contacto_ids && e.contacto_ids.length > 0 ? e.contacto_ids : e.contacto_id ? [e.contacto_id] : [];

export interface Cita {
  key: string;
  categoria: Categoria;
  titulo: string;
  inicio: Date;
  todoElDia: boolean;
  contactoId: number | null;
  /** Personas apuntadas a una cita de `eventos` (puede haber varias). */
  personas?: Persona[];
  hecho: boolean;
  anulada?: boolean;
  /** Para marcarla como hecha desde "Mi día". */
  demoId?: number;
  ventaId?: string;
  lugar?: string | null;
  notas?: string | null;
  evento?: EventoRow;
}

type Vista = "mes" | "semana" | "dia" | "lista";
const VISTAS: { id: Vista; label: string }[] = [
  { id: "mes", label: "Mes" },
  { id: "semana", label: "Semana" },
  { id: "dia", label: "Día" },
  { id: "lista", label: "Lista" },
];

// ---------- Ayudas de fecha ----------
const pad = (n: number) => n.toString().padStart(2, "0");
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** Formato de `recordatorios.fecha` (timestamp sin zona, hora local tal cual). */
const naive = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");
const desdeFechaSola = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");
/** En el calendario no hace falta ver "[CEDIDO]": en la ficha se queda, porque la app lo usa para reconocerlas. */
const limpiarNombre = (n: string) => n.replace(/\[cedido\]\s*/gi, "").trim();
export const horaDe = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function rangoDe(vista: Vista, cursor: Date): { desde: Date; hasta: Date } {
  if (vista === "mes") {
    return {
      desde: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      hasta: addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 1),
    };
  }
  if (vista === "semana") {
    const desde = startOfWeek(cursor, { weekStartsOn: 1 });
    return { desde, hasta: addDays(desde, 7) };
  }
  if (vista === "dia") {
    const desde = startOfDay(cursor);
    return { desde, hasta: addDays(desde, 1) };
  }
  // Lista: los próximos 30 días desde el día elegido.
  const desde = startOfDay(cursor);
  return { desde, hasta: addDays(desde, 30) };
}

function tituloRango(vista: Vista, cursor: Date): string {
  const { desde, hasta } = rangoDe(vista, cursor);
  if (vista === "mes") return format(cursor, "MMMM 'de' yyyy", { locale: es });
  if (vista === "dia") return format(cursor, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const fin = addDays(hasta, -1);
  return `${format(desde, "d MMM", { locale: es })} – ${format(fin, "d MMM yyyy", { locale: es })}`;
}

/** Fechas en las que cae una cita dentro del rango (varias si se repite cada semana). */
function repeticionesEnRango(e: EventoRow, desde: Date, hasta: Date): Date[] {
  const primera = new Date(e.inicio);
  if (e.repeticion !== "semanal") return primera >= desde && primera < hasta ? [primera] : [];
  const limite = e.repetir_hasta ? addDays(desdeFechaSola(e.repetir_hasta), 1) : hasta;
  const fin = limite < hasta ? limite : hasta;
  // addWeeks mantiene la hora local aunque cambie el horario de verano.
  const cada = Math.max(1, e.cada_semanas ?? 1);
  let n = Math.max(0, Math.floor((desde.getTime() - primera.getTime()) / (7 * cada * 86400000)) - 1);
  const fechas: Date[] = [];
  for (let d = addWeeks(primera, n * cada); d < fin; d = addWeeks(primera, ++n * cada)) {
    if (d >= desde) fechas.push(d);
  }
  return fechas;
}

const estadoDe = (e: EventoRow, dia: Date) => {
  const estado = e.estados?.[ymd(dia)];
  return { hecho: estado === "hecho", anulada: estado === "anulado" };
};

/**
 * Marca una cita de la tabla `eventos` como hecha o anulada ese día (null la
 * deja como estaba). Las demos solo se pueden marcar como hechas. Las
 * bienvenidas se marcan con updateVenta, para que Ventas se entere.
 */
export async function marcarCita(c: Cita, estado: EstadoCita | null): Promise<void> {
  if (c.evento) {
    // Se vuelve a leer por si otro día de la misma cita se marcó desde otro aparato.
    const { data, error } = await supabase.from("eventos").select("estados").eq("id", c.evento.id).single();
    if (error) throw error;
    const estados: Record<string, EstadoCita> = { ...(data?.estados ?? {}) };
    if (estado) estados[ymd(c.inicio)] = estado;
    else delete estados[ymd(c.inicio)];
    const { error: errorGuardar } = await supabase.from("eventos").update({ estados }).eq("id", c.evento.id);
    if (errorGuardar) throw errorGuardar;
  } else if (c.demoId != null) {
    const { error } = await supabase.from("demos").update({ completada: estado === "hecho" }).eq("id", c.demoId);
    if (error) throw error;
  } else {
    throw new Error("Esta cita no se puede marcar desde aquí");
  }
}

// ---------- Carga de datos ----------
export async function cargarCitas(desde: Date, hasta: Date): Promise<Cita[]> {
  const [eventosR, demosR, ventasR, recR, rellR] = await Promise.all([
    // Las que se repiten cada semana se traen aunque empezaran antes.
    supabase.from("eventos").select("*").lt("inicio", hasta.toISOString()).or(`inicio.gte."${desde.toISOString()}",repeticion.not.is.null`),
    supabase.from("demos").select("id, contacto_id, fecha_demo, completada, notas").gte("fecha_demo", ymd(desde)).lt("fecha_demo", ymd(hasta)),
    supabase.from("ventas").select("id, contacto_id, contacto_nombre, modelo, fecha_bienvenida, bienvenida_realizada").gte("fecha_bienvenida", ymd(desde)).lt("fecha_bienvenida", ymd(hasta)),
    supabase.from("recordatorios").select("id, contacto_id, contacto_nombre, fecha, tipo, notas, completado, completado_en").gte("fecha", naive(desde)).lt("fecha", naive(hasta)),
    supabase.from("rellamar").select("contact_id, fecha_rellamada").gte("fecha_rellamada", ymd(desde)).lt("fecha_rellamada", ymd(hasta)),
  ]);
  for (const r of [eventosR, demosR, ventasR, recR, rellR]) if (r.error) throw r.error;

  // Nombres de las clientas que no vienen en la propia fila.
  const ids = new Set<number>();
  (eventosR.data ?? []).forEach((e: EventoRow) => idsDe(e).forEach((id) => ids.add(id)));
  (demosR.data ?? []).forEach((d: any) => d.contacto_id && ids.add(d.contacto_id));
  (rellR.data ?? []).forEach((r: any) => r.contact_id && ids.add(Number(r.contact_id)));
  const nombres = new Map<number, string>();
  if (ids.size > 0) {
    const { data, error } = await supabase.from("contacts").select("id, nombre").in("id", [...ids]);
    if (error) throw error;
    (data ?? []).forEach((c: any) => nombres.set(c.id, limpiarNombre(c.nombre ?? "")));
  }
  const nombre = (id: number | null) => (id ? nombres.get(id) ?? "Clienta" : "");

  const citas: Cita[] = [];

  (eventosR.data ?? []).forEach((e: EventoRow) => {
    const personas = idsDe(e).map((id) => ({ id, nombre: nombre(id) }));
    const quienes = personas.map((x) => x.nombre).filter((n) => !e.titulo.includes(n)).join(", ");
    citas.push(...repeticionesEnRango(e, desde, hasta).map((inicio) => ({
      ...estadoDe(e, inicio),
      key: `evento-${e.id}-${inicio.getTime()}`,
      categoria: e.tipo,
      titulo: quienes ? `${e.titulo} · ${quienes}` : e.titulo,
      inicio,
      todoElDia: e.todo_el_dia,
      contactoId: personas[0]?.id ?? null,
      personas,
      lugar: e.lugar,
      notas: e.notas,
      evento: e,
    })));
  });

  (demosR.data ?? []).forEach((d: any) => {
    citas.push({
      key: `demo-${d.id}`,
      categoria: "demo",
      titulo: `Demo · ${nombre(d.contacto_id)}`,
      inicio: desdeFechaSola(d.fecha_demo),
      todoElDia: true,
      contactoId: d.contacto_id,
      hecho: !!d.completada,
      demoId: d.id,
      notas: d.notas,
    });
  });

  (ventasR.data ?? []).forEach((v: any) => {
    citas.push({
      key: `bienvenida-${v.id}`,
      categoria: "bienvenida",
      titulo: `Bienvenida · ${limpiarNombre(v.contacto_nombre ?? "")}${v.modelo ? ` (${v.modelo})` : ""}`,
      inicio: desdeFechaSola(v.fecha_bienvenida),
      todoElDia: true,
      contactoId: v.contacto_id,
      hecho: !!v.bienvenida_realizada,
      ventaId: String(v.id),
    });
  });

  // Seguimientos y rellamar: igual que en la Agenda, sin ⛔ ni "solo si me necesita".
  (recR.data ?? []).forEach((r: any) => {
    if (r.completado || r.completado_en) return;
    if (noProponerLlamar(r.contacto_nombre ?? "")) return;
    const inicio = new Date(r.fecha);
    citas.push({
      key: `rec-${r.id}`,
      categoria: "seguimiento",
      titulo: `${limpiarNombre(r.contacto_nombre ?? "") || "Recordatorio"}${r.tipo && r.tipo !== "general" ? ` · ${r.tipo}` : ""}`,
      inicio,
      todoElDia: inicio.getHours() === 0 && inicio.getMinutes() === 0,
      contactoId: r.contacto_id,
      hecho: false,
      notas: r.notas,
    });
  });

  (rellR.data ?? []).forEach((r: any) => {
    const id = Number(r.contact_id);
    if (noProponerLlamar(nombre(id))) return;
    const inicio = new Date(r.fecha_rellamada.length === 10 ? r.fecha_rellamada + "T00:00:00" : r.fecha_rellamada);
    citas.push({
      key: `rell-${id}`,
      categoria: "rellamar",
      titulo: `Rellamar · ${nombre(id)}`,
      inicio,
      todoElDia: inicio.getHours() === 0 && inicio.getMinutes() === 0,
      contactoId: id,
      hecho: false,
    });
  });

  // Primero las de todo el día, luego por hora.
  return citas.sort((a, b) =>
    a.inicio.toDateString() === b.inicio.toDateString() && a.todoElDia !== b.todoElDia
      ? (a.todoElDia ? -1 : 1)
      : a.inicio.getTime() - b.inicio.getTime()
  );
}

// ---------- Formulario de cita ----------
interface FormCita {
  id: number | null;
  tipo: Categoria;
  titulo: string;
  fecha: string;
  todoElDia: boolean;
  horaInicio: string;
  horaFin: string;
  lugar: string;
  personas: Persona[];
  notas: string;
  semanal: boolean;
  cadaSemanas: number;
  repetirHasta: string;
}

const formVacio = (fecha: Date): FormCita => ({
  id: null,
  tipo: "demo",
  titulo: "",
  fecha: ymd(fecha),
  todoElDia: false,
  horaInicio: "10:00",
  horaFin: "11:00",
  lugar: "",
  personas: [],
  notas: "",
  semanal: false,
  cadaSemanas: 1,
  repetirHasta: "",
});

function BuscadorPersonas({
  personas, onCambiar, onVerFicha,
}: { personas: Persona[]; onCambiar: (p: Persona[]) => void; onVerFicha?: (id: number) => void }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<{ id: number; nombre: string; ubicacion: string | null }[]>([]);

  useEffect(() => {
    // Cada palabra por separado: "ana garcia" encuentra "ANA ISABEL GARCÍA LÓPEZ".
    const palabras = texto.trim().split(/\s+/).filter((w) => w.length >= 2);
    if (palabras.length === 0) {
      setResultados([]);
      return;
    }
    const temporizador = setTimeout(async () => {
      let q = supabase.from("contacts").select("id, nombre, ubicacion");
      for (const w of palabras) q = q.ilike("nombre", `%${w}%`);
      const { data } = await q.limit(8);
      setResultados(data ?? []);
    }, 250);
    return () => clearTimeout(temporizador);
  }, [texto]);

  return (
    <div className="space-y-2">
      {personas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-muted pl-3 pr-1 py-0.5 text-sm">
              {onVerFicha ? (
                <button type="button" className="hover:underline" title="Ver ficha" onClick={() => onVerFicha(p.id)}>
                  {p.nombre}
                </button>
              ) : (
                p.nombre
              )}
              <button
                type="button"
                title="Quitar"
                className="rounded-full w-5 h-5 flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => onCambiar(personas.filter((x) => x.id !== p.id))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={texto}
          placeholder={personas.length ? "Añadir otra persona" : "Escribe el nombre (opcional)"}
          onChange={(e) => setTexto(e.target.value)}
        />
        {resultados.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
            {resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  if (!personas.some((x) => x.id === c.id)) onCambiar([...personas, { id: c.id, nombre: limpiarNombre(c.nombre) }]);
                  setTexto("");
                  setResultados([]);
                }}
              >
                {limpiarNombre(c.nombre)}
                {c.ubicacion && <span className="text-muted-foreground"> · {c.ubicacion}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Pantalla ----------
interface CalendarioProps {
  onViewContact: (id: number) => void;
}

function vistaInicial(): Vista {
  try {
    const guardada = localStorage.getItem("calendario_vista") as Vista | null;
    if (guardada && VISTAS.some((v) => v.id === guardada)) return guardada;
  } catch {
    // sin almacenamiento: seguimos con la de por defecto
  }
  return typeof window !== "undefined" && window.innerWidth < 768 ? "lista" : "mes";
}

export default function Calendario({ onViewContact }: CalendarioProps) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [filtro, setFiltro] = useState<Categoria | "todas">("todas");
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<FormCita | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState<Cita | null>(null);

  const { desde, hasta } = useMemo(() => rangoDe(vista, cursor), [vista, cursor]);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setCitas(await cargarCitas(desde, hasta));
    } catch (e) {
      console.error("Error cargando el calendario:", e);
      toast.error("No se pudo cargar el calendario. Revisa la conexión.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem("calendario_vista", v);
    } catch {
      // da igual si no se puede recordar
    }
  };

  const mover = (dir: 1 | -1) => {
    setCursor((c) =>
      vista === "mes" ? addMonths(c, dir) : vista === "semana" ? addWeeks(c, dir) : vista === "dia" ? addDays(c, dir) : addDays(c, 30 * dir)
    );
  };

  const visibles = useMemo(
    () => (filtro === "todas" ? citas : citas.filter((c) => c.categoria === filtro)),
    [citas, filtro]
  );
  const citasDelDia = (d: Date) => visibles.filter((c) => isSameDay(c.inicio, d));

  const abrirNueva = (fecha: Date) => setForm(formVacio(fecha));

  const abrirCita = (c: Cita) => {
    if (c.evento) {
      const e = c.evento;
      const ini = new Date(e.inicio);
      const fin = e.fin ? new Date(e.fin) : new Date(ini.getTime() + 60 * 60000);
      setForm({
        id: e.id,
        tipo: e.tipo,
        titulo: e.titulo,
        fecha: ymd(ini),
        todoElDia: e.todo_el_dia,
        horaInicio: horaDe(ini),
        horaFin: horaDe(fin),
        lugar: e.lugar ?? "",
        personas: c.personas ?? [],
        notas: e.notas ?? "",
        semanal: e.repeticion === "semanal",
        cadaSemanas: e.cada_semanas ?? 1,
        repetirHasta: e.repetir_hasta ?? "",
      });
    } else {
      setDetalle(c);
    }
  };

  const fechasDelForm = (f: FormCita) => {
    const inicio = new Date(`${f.fecha}T${f.todoElDia ? "00:00" : f.horaInicio || "10:00"}:00`);
    const fin = f.todoElDia ? null : new Date(`${f.fecha}T${f.horaFin || f.horaInicio || "11:00"}:00`);
    return { inicio, fin: fin && fin > inicio ? fin : null };
  };

  const guardar = async () => {
    if (!form) return;
    const titulo = form.titulo.trim() || catInfo(form.tipo).singular;
    if (!form.fecha) {
      toast.error("Pon la fecha de la cita");
      return;
    }
    const { inicio, fin } = fechasDelForm(form);
    const fila = {
      tipo: form.tipo,
      titulo,
      inicio: inicio.toISOString(),
      fin: fin ? fin.toISOString() : null,
      todo_el_dia: form.todoElDia,
      lugar: form.lugar.trim() || null,
      contacto_id: form.personas[0]?.id ?? null,
      contacto_ids: form.personas.map((p) => p.id),
      notas: form.notas.trim() || null,
      repeticion: form.semanal ? "semanal" : null,
      cada_semanas: form.semanal ? form.cadaSemanas : 1,
      repetir_hasta: form.semanal && form.repetirHasta ? form.repetirHasta : null,
    };
    setGuardando(true);
    const { error } = form.id
      ? await supabase.from("eventos").update(fila).eq("id", form.id)
      : await supabase.from("eventos").insert(fila);
    setGuardando(false);
    if (error) {
      console.error(error);
      toast.error("No se pudo guardar la cita");
      return;
    }
    toast.success(form.id ? "Cita actualizada" : "Cita guardada");
    setForm(null);
    recargar();
  };

  const borrar = async () => {
    if (!form?.id) return;
    const aviso = form.semanal
      ? "Esta cita se repite. ¿Seguro que quieres borrarla? Se borran todas las repeticiones."
      : "¿Seguro que quieres borrar esta cita?";
    if (!window.confirm(aviso)) return;
    const { error } = await supabase.from("eventos").delete().eq("id", form.id);
    if (error) {
      toast.error("No se pudo borrar la cita");
      return;
    }
    toast.success("Cita borrada");
    setForm(null);
    recargar();
  };

  const pasarAGoogle = () => {
    if (!form) return;
    const { inicio, fin } = fechasDelForm(form);
    const info = catInfo(form.tipo);
    abrirCitaEnGoogleCalendar({
      titulo: `${info.emoji} ${form.titulo.trim() || info.singular}${form.personas.length ? ` · ${form.personas.map((p) => p.nombre).join(", ")}` : ""}`,
      inicio,
      fin,
      todoElDia: form.todoElDia,
      lugar: form.lugar,
      notas: form.notas,
    });
  };

  // ---------- Piezas de pintado ----------
  const Chip = ({ c, compacto = false }: { c: Cita; compacto?: boolean }) => {
    const info = catInfo(c.categoria);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          abrirCita(c);
        }}
        title={c.titulo}
        className={`w-full text-left rounded border px-1.5 py-0.5 truncate ${compacto ? "text-[11px]" : "text-sm py-1"} ${info.color} ${c.hecho || c.anulada ? "opacity-50 line-through" : ""}`}
      >
        {!c.todoElDia && <span className="font-semibold mr-1">{horaDe(c.inicio)}</span>}
        <span className="mr-1">{c.anulada ? "❌" : info.emoji}</span>
        {c.titulo}
      </button>
    );
  };

  const FilaLista = ({ c }: { c: Cita }) => {
    const info = catInfo(c.categoria);
    return (
      <button
        type="button"
        onClick={() => abrirCita(c)}
        className={`w-full flex items-start gap-3 text-left rounded-lg border p-3 hover:bg-accent/40 ${c.hecho || c.anulada ? "opacity-50" : ""}`}
      >
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${info.punto}`} />
        <div className="min-w-0 flex-1">
          <div className={`font-medium ${c.hecho || c.anulada ? "line-through" : ""}`}>
            {info.emoji} {c.titulo}
          </div>
          {c.anulada && <div className="text-xs font-semibold text-red-600">❌ Anulada</div>}
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
            <span>{c.todoElDia ? "Todo el día" : horaDe(c.inicio)}</span>
            <span>{info.label}</span>
            {c.lugar && <span>📍 {c.lugar}</span>}
          </div>
          {c.notas && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.notas}</div>}
        </div>
      </button>
    );
  };

  const dias = eachDayOfInterval({ start: desde, end: addDays(hasta, -1) });

  const renderMes = () => (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted text-xs font-semibold text-center">
        {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const lista = citasDelDia(d);
          const fuera = !isSameMonth(d, cursor);
          const finde = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={d.toISOString()}
              onClick={() => abrirNueva(d)}
              className={`group min-h-[64px] md:min-h-[110px] border-t border-l p-1 cursor-pointer ${finde ? "bg-muted/40" : ""} ${isToday(d) ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCursor(d);
                    cambiarVista("dia");
                  }}
                  className={`text-xs md:text-sm rounded-full w-6 h-6 flex items-center justify-center hover:bg-accent ${fuera ? "text-muted-foreground/50" : ""} ${isToday(d) ? "bg-primary text-primary-foreground font-bold" : ""}`}
                >
                  {d.getDate()}
                </button>
                <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 hidden md:block" />
              </div>
              {/* En el móvil solo puntos de colores; en el ordenador, las citas. */}
              <div className="flex flex-wrap gap-0.5 mt-1 md:hidden">
                {lista.slice(0, 6).map((c) => (
                  <span key={c.key} className={`h-1.5 w-1.5 rounded-full ${catInfo(c.categoria).punto}`} />
                ))}
              </div>
              <div className="hidden md:block space-y-0.5 mt-1">
                {lista.slice(0, 3).map((c) => <Chip key={c.key} c={c} compacto />)}
                {lista.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCursor(d);
                      cambiarVista("dia");
                    }}
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    +{lista.length - 3} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSemana = () => (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {dias.map((d) => {
        const lista = citasDelDia(d);
        return (
          <div key={d.toISOString()} className={`border rounded-lg p-2 min-h-[120px] ${isToday(d) ? "border-primary bg-yellow-50 dark:bg-yellow-900/20" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => {
                  setCursor(d);
                  cambiarVista("dia");
                }}
                className="text-sm font-semibold capitalize hover:underline"
              >
                {format(d, "EEE d/MM", { locale: es })}
              </button>
              <button type="button" onClick={() => abrirNueva(d)} title="Nueva cita este día" className="text-muted-foreground hover:text-foreground">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {lista.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
              {lista.map((c) => <Chip key={c.key} c={c} compacto />)}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDia = () => {
    const lista = citasDelDia(cursor);
    return (
      <div className="space-y-2">
        {lista.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">No hay nada apuntado este día.</Card>
        )}
        {lista.map((c) => <FilaLista key={c.key} c={c} />)}
      </div>
    );
  };

  const renderLista = () => {
    const conCitas = dias.filter((d) => citasDelDia(d).length > 0);
    if (conCitas.length === 0) {
      return <Card className="p-6 text-center text-muted-foreground">No hay nada apuntado en los próximos 30 días.</Card>;
    }
    return (
      <div className="space-y-4">
        {conCitas.map((d) => (
          <div key={d.toISOString()}>
            <div className={`text-sm font-semibold capitalize mb-2 ${isToday(d) ? "text-primary" : ""}`}>
              {isToday(d) ? "Hoy · " : ""}
              {format(d, "EEEE d 'de' MMMM", { locale: es })}
            </div>
            <div className="space-y-2">
              {citasDelDia(d).map((c) => <FilaLista key={c.key} c={c} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CabeceraFormacion icono={CalendarDays} titulo="Calendario" />
        <Button onClick={() => abrirNueva(vista === "dia" ? cursor : new Date())}>
          <Plus className="w-4 h-4 mr-1" /> Nueva cita
        </Button>
      </div>

      {/* Filtro por tipo */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFiltro("todas")}
          className={`px-3 py-1 rounded-full text-xs border ${filtro === "todas" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
        >
          Todas
        </button>
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltro(filtro === c.id ? "todas" : c.id)}
            className={`px-3 py-1 rounded-full text-xs border flex items-center gap-1.5 ${filtro === c.id ? c.color + " font-semibold" : "hover:bg-accent"}`}
          >
            <span className={`h-2 w-2 rounded-full ${c.punto}`} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold capitalize">{tituloRango(vista, cursor)}</h2>
          {cargando && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => cambiarVista(v.id)}
                className={`px-3 py-1 text-sm rounded-md ${vista === v.id ? "bg-background shadow font-semibold text-primary" : "text-muted-foreground"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center border rounded-lg">
            <button type="button" onClick={() => mover(-1)} className="p-2 hover:bg-accent rounded-l-lg" title="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="px-3 py-1 text-sm font-medium hover:bg-accent">
              Hoy
            </button>
            <button type="button" onClick={() => mover(1)} className="p-2 hover:bg-accent rounded-r-lg" title="Siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {vista === "mes" && renderMes()}
      {vista === "semana" && renderSemana()}
      {vista === "dia" && renderDia()}
      {vista === "lista" && renderLista()}

      {/* Citas que vienen de otros apartados: solo se miran desde aquí */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-md">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle>{catInfo(detalle.categoria).emoji} {detalle.titulo}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p className="capitalize">
                  {format(detalle.inicio, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
                  {!detalle.todoElDia && ` · ${horaDe(detalle.inicio)}`}
                </p>
                <p className="text-muted-foreground">
                  {catInfo(detalle.categoria).label}
                  {detalle.hecho ? " · hecha" : ""}
                </p>
                {detalle.notas && <p className="whitespace-pre-wrap rounded bg-muted p-2">{detalle.notas}</p>}
                <p className="text-xs text-muted-foreground">
                  {detalle.categoria === "bienvenida"
                    ? "Para cambiar la fecha, ve a Ventas y Bienvenidas."
                    : detalle.categoria === "seguimiento"
                      ? "Para cambiarlo, ve a Recordatorios o a la ficha de la clienta."
                      : "Para cambiarla, ve a la ficha de la clienta."}
                </p>
              </div>
              <DialogFooter className="gap-2">
                {detalle.contactoId && (
                  <Button
                    onClick={() => {
                      const id = detalle.contactoId!;
                      setDetalle(null);
                      onViewContact(id);
                    }}
                  >
                    <User className="w-4 h-4 mr-1" /> Ver ficha
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nueva cita / editar cita */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar cita" : "Nueva cita"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Tipo</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {TIPOS_EVENTO.map((t) => {
                      const info = catInfo(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, tipo: t })}
                          className={`px-3 py-1.5 rounded-full text-sm border ${form.tipo === t ? info.color + " font-semibold" : "hover:bg-accent"}`}
                        >
                          {info.emoji} {info.singular}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>Personas</Label>
                  <BuscadorPersonas
                    personas={form.personas}
                    onCambiar={(personas) => setForm((f) => (f ? { ...f, personas } : f))}
                    onVerFicha={
                      form.id
                        ? (id) => {
                            setForm(null);
                            onViewContact(id);
                          }
                        : undefined
                    }
                  />
                </div>

                <div>
                  <Label>Título</Label>
                  <Input
                    value={form.titulo}
                    placeholder={form.tipo === "feria" ? "Ej.: Fira de Nadal de Molins" : form.tipo === "reunion" ? "Ej.: Reunión comercial" : "Si lo dejas vacío se pone el tipo y la clienta"}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Fecha</Label>
                    <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                  <label className="col-span-2 sm:col-span-1 flex items-center gap-2 sm:mt-6 text-sm cursor-pointer">
                    <Checkbox checked={form.todoElDia} onCheckedChange={(v) => setForm({ ...form, todoElDia: v === true })} />
                    Todo el día
                  </label>
                  {!form.todoElDia && (
                    <>
                      <div>
                        <Label>De</Label>
                        <Input type="time" value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} />
                      </div>
                      <div>
                        <Label>A</Label>
                        <Input type="time" value={form.horaFin} onChange={(e) => setForm({ ...form, horaFin: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.semanal} onCheckedChange={(v) => setForm({ ...form, semanal: v === true })} />
                    Se repite
                  </label>
                  {form.semanal && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>Cada</span>
                      <select
                        className="rounded-md border bg-background px-2 py-1"
                        value={form.cadaSemanas}
                        onChange={(e) => setForm({ ...form, cadaSemanas: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "semana" : `${n} semanas`}
                          </option>
                        ))}
                      </select>
                      {form.fecha && (
                        <span className="text-muted-foreground">({format(new Date(form.fecha + "T00:00:00"), "EEEE", { locale: es })})</span>
                      )}
                    </div>
                  )}
                  {form.semanal && (
                    <div>
                      <Label className="text-xs">Hasta (déjalo vacío si es para siempre)</Label>
                      <Input type="date" value={form.repetirHasta} onChange={(e) => setForm({ ...form, repetirHasta: e.target.value })} />
                      {form.id && (
                        <p className="text-xs text-muted-foreground mt-1">Si cambias algo aquí, cambia en todas las semanas.</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Lugar</Label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={form.lugar}
                      placeholder={form.tipo === "clase" ? "Zoom" : "Dirección o pueblo"}
                      onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Notas</Label>
                  <Textarea rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
                <div className="flex gap-2">
                  {form.id && (
                    <Button variant="outline" onClick={borrar} className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-1" /> Borrar
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={pasarAGoogle} title="Abre Google Calendar con la cita rellenada">
                    <CalendarPlus className="w-4 h-4 mr-1" /> Google Calendar
                  </Button>
                  <Button onClick={guardar} disabled={guardando}>
                    {guardando ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
