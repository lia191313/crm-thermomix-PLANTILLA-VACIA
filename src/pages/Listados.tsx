import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Edit, Trash2, ChevronLeft, ChevronRight, Search, Phone, UserCheck, UserX, RotateCcw, Pencil, AlertTriangle, ClipboardList, CalendarClock, Briefcase, Copy,
} from "lucide-react";
import { ClipboardList as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { BotonPromos } from "@/components/Promociones";
import { toast } from "sonner";
import { ZONAS, zonaDe } from "@/lib/zonas";
import { useSupabaseListados, fetchClientesBasicos, type PersonaListado, type Listado } from "@/hooks/useSupabaseListados";
import { confirmarLlamada } from "@/lib/callDialog";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { ultimaActividad } from "@/lib/franjaRecordatorio";
import {
  parsearListado, detectarDuplicados, normalizarNombre, normalizarTelefono, nombreCompleto, type FilaListado, type Aviso, type EstadoPersona,
  fechaISO, sumarDias, estadoRellamada, formatDia, franjaActual, FRANJA_LABEL, type Franja, tomarFiltroInicialListados, notaDeEstaLlamada,
} from "@/lib/listados";

const PERSONAS_PER_PAGE = 50;
const STORAGE_KEY = "thermomix_listado_seleccionado";

/** "HH:MM" de dentro de `min` minutos (redondeado a 5 minutos). */
function horaDentroDe(min: number): string {
  const d = new Date(Date.now() + min * 60000);
  if (min > 0) d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** Antes de las 15:00 es mañana; desde las 15:00, tarde. */
const franjaDeHora = (hora: string): Franja => (hora < "15:00" ? "manana" : "tarde");

type Orden = "poblacion" | "apellidos" | "nombre" | "llamada";
// "rellamar" = toca volver a llamar hoy (o ya pasó el día); "programadas" = rellamada otro día.
// "sinllamar" = pendientes a las que todavía no se ha llamado nunca.
type FiltroEstado = EstadoPersona | "todos" | "rellamar" | "programadas" | "sinllamar";

const ESTADO_LABEL: Record<EstadoPersona, string> = {
  pendiente: "Pendiente",
  adoptado: "Adoptado",
  descartado: "Descartado",
  comercial: "Tiene comercial",
};

const ESTADO_COLORS: Record<EstadoPersona, string> = {
  // Pendiente en verde clarito (le gusta así, 21/10/2026); adoptado en verde fuerte para distinguirlos.
  pendiente: "bg-green-50 text-green-700",
  adoptado: "bg-green-600 text-white",
  descartado: "bg-gray-100 text-gray-400",
  comercial: "bg-gray-100 text-gray-700",
};

// Texto de los contadores de arriba ("3 pendientes", "1 tiene comercial"...).
const contadorEstado = (e: EstadoPersona, n: number) =>
  e === "comercial" ? `${n} ${n === 1 ? "tiene" : "tienen"} comercial` : `${n} ${ESTADO_LABEL[e].toLowerCase()}s`;

const compararTexto = (a: string, b: string) =>
  (a || "￿").localeCompare(b || "￿", "es", { sensitivity: "base" });

// Clave para agrupar poblaciones sin distinguir mayúsculas ni acentos.
const clavePoblacion = (poblacion: string) => normalizarNombre(poblacion) || "-";

const formatFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "";

export default function Listados() {
  const {
    listados, personas, loading, error, loadAll,
    crearListado, anadirAListado, renombrarListado, borrarListado, actualizarPersona, registrarLlamada, anotarLlamada, adoptarPersona,
  } = useSupabaseListados();

  const [listadoId, setListadoId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(() => {
    const pedido = tomarFiltroInicialListados();
    return pedido === "rellamar" || pedido === "programadas" ? pedido : "pendiente";
  });
  const [filtroZona, setFiltroZona] = useState("");
  const [filtroPoblacion, setFiltroPoblacion] = useState("");
  const [filtroFranja, setFiltroFranja] = useState<Franja | "">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [orden, setOrden] = useState<Orden>("poblacion");
  const [currentPage, setCurrentPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PersonaListado | null>(null);
  const [trasLlamada, setTrasLlamada] = useState(false);
  const [llamadaActualId, setLlamadaActualId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Si alguien del listado ya tiene ficha en Contactos (mismo teléfono) y aquí sigue
  // pendiente, se avisa: así no se la vuelve a llamar como si fuera nueva.
  const [clientesPorTel, setClientesPorTel] = useState<Map<string, { id: number; nombre: string }>>(new Map());
  useEffect(() => {
    fetchClientesBasicos()
      .then((cs) => {
        const m = new Map<string, { id: number; nombre: string }>();
        cs.forEach((c) => {
          const t = normalizarTelefono(c.telefono);
          if (t.length >= 6) m.set(t, { id: c.id, nombre: c.nombre });
        });
        setClientesPorTel(m);
      })
      .catch(() => {});
  }, [personas.length]);
  const { contactos: interacciones } = useLlamadasGlobales();

  // Si el listado guardado ya no existe, seleccionamos el más reciente.
  const listadoActual = listados.find((l) => l.id === listadoId) ?? listados[0] ?? null;

  useEffect(() => {
    if (!listadoActual) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(listadoActual.id));
    } catch {
      // sin localStorage no pasa nada: se abrirá el más reciente
    }
  }, [listadoActual]);

  useEffect(() => {
    setCurrentPage(1);
  }, [listadoActual?.id, filtroEstado, filtroZona, filtroPoblacion, searchTerm, orden, filtroFranja]);

  useEffect(() => {
    setFiltroFranja("");
  }, [filtroEstado]);

  const nombreListado = (id: number | null) =>
    listados.find((l) => l.id === id)?.nombre ?? "un listado ya borrado";

  const personasListado = useMemo(
    () => (listadoActual ? personas.filter((p) => p.listado_id === listadoActual.id) : []),
    [personas, listadoActual]
  );

  const hoy = fechaISO();
  // Ya llamada hoy: la fila sale en verde para no repetir en la misma sesión.
  const llamadaHoy = (p: PersonaListado) => !!p.ultima_llamada && fechaISO(new Date(p.ultima_llamada)) === hoy;

  // Las que tienen rellamada para otro día no salen en "pendientes" hasta su día.
  const cumpleEstado = (p: PersonaListado) => {
    const r = estadoRellamada(p, hoy);
    if (filtroEstado === "todos") return true;
    if (filtroEstado === "rellamar") return r === "hoy";
    if (filtroEstado === "programadas") return r === "programada";
    if (filtroEstado === "pendiente") return p.estado === "pendiente" && r !== "programada";
    if (filtroEstado === "sinllamar") return p.estado === "pendiente" && r !== "programada" && !(p.llamadas > 0);
    return p.estado === filtroEstado;
  };

  const contadores = useMemo(() => {
    const c = { pendiente: 0, adoptado: 0, descartado: 0, comercial: 0, rellamar: 0, programadas: 0, rellamarManana: 0, rellamarTarde: 0 };
    personasListado.forEach((p) => {
      const r = estadoRellamada(p, hoy);
      if (r === "programada") c.programadas++;
      else c[p.estado]++;
      if (r === "hoy") {
        c.rellamar++;
        if (p.franja === "manana") c.rellamarManana++;
        if (p.franja === "tarde") c.rellamarTarde++;
      }
    });
    return c;
  }, [personasListado, hoy]);

  const pendientesPorListado = useMemo(() => {
    const m = new Map<number, number>();
    personas.forEach((p) => {
      if (p.listado_id !== null && p.estado === "pendiente") m.set(p.listado_id, (m.get(p.listado_id) ?? 0) + 1);
    });
    return m;
  }, [personas]);

  // Zonas (grupos de poblaciones) con cuántas personas hay en cada una según el estado.
  const zonas = useMemo(() => {
    const m = new Map<string, number>();
    personasListado.filter(cumpleEstado).forEach((p) => m.set(zonaDe(p.poblacion), (m.get(zonaDe(p.poblacion)) ?? 0) + 1));
    return ZONAS.map((z) => [z, m.get(z) ?? 0] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personasListado, filtroEstado, hoy]);

  // Poblaciones del listado (sin distinguir mayúsculas ni acentos) con cuántas
  // personas hay en cada una según el estado que se está mirando (y la zona elegida).
  const poblaciones = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    personasListado
      .filter(cumpleEstado)
      .filter((p) => !filtroZona || zonaDe(p.poblacion) === filtroZona)
      .forEach((p) => {
        const key = clavePoblacion(p.poblacion);
        const prev = m.get(key);
        m.set(key, { label: prev?.label ?? (p.poblacion.trim() || "Sin población"), count: (prev?.count ?? 0) + 1 });
      });
    return [...m.entries()].sort((a, b) => compararTexto(a[1].label, b[1].label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personasListado, filtroEstado, filtroZona, hoy]);

  const filtradas = useMemo(() => {
    const term = normalizarNombre(searchTerm);
    const lista = personasListado.filter((p) => {
      // Al buscar se busca en todo el listado, sin importar el filtro de estado,
      // franja o población (si no, alguien con rellamada para otro día "desaparece").
      if (!term) {
        if (!cumpleEstado(p)) return false;
        if (filtroFranja && p.franja !== filtroFranja) return false;
        if (filtroZona && zonaDe(p.poblacion) !== filtroZona) return false;
        if (filtroPoblacion && clavePoblacion(p.poblacion) !== filtroPoblacion) return false;
        return true;
      }
      return (
        normalizarNombre(nombreCompleto(p)).includes(term) ||
        normalizarNombre(p.poblacion).includes(term) ||
        normalizarNombre(p.notas).includes(term) ||
        p.telefono.replace(/\D/g, "").includes(searchTerm.replace(/\D/g, "") || "\u0000")
      );
    });
    const porPoblacion = (a: PersonaListado, b: PersonaListado) => compararTexto(a.poblacion, b.poblacion);
    const porApellidos = (a: PersonaListado, b: PersonaListado) =>
      compararTexto(a.apellidos, b.apellidos) || compararTexto(a.nombre, b.nombre);
    const porNombre = (a: PersonaListado, b: PersonaListado) =>
      compararTexto(a.nombre, b.nombre) || compararTexto(a.apellidos, b.apellidos);
    // "Llamada": primero a quien nunca se ha llamado, luego la llamada más antigua.
    const porLlamada = (a: PersonaListado, b: PersonaListado) =>
      (a.ultima_llamada ?? "").localeCompare(b.ultima_llamada ?? "");
    const cmp = {
      poblacion: (a: PersonaListado, b: PersonaListado) => porPoblacion(a, b) || porApellidos(a, b),
      apellidos: porApellidos,
      nombre: porNombre,
      llamada: (a: PersonaListado, b: PersonaListado) => porLlamada(a, b) || porPoblacion(a, b),
    }[orden];
    // En "Rellamar hoy", primero las de la franja en la que estamos (mañana o tarde),
    // luego las de cualquier hora y al final las de la otra franja.
    const ahora = franjaActual();
    const pesoFranja = (p: PersonaListado) => (p.franja === ahora ? 0 : p.franja ? 2 : 1);
    // Las que tienen hora concreta van primero, por orden de hora.
    const claveHora = (p: PersonaListado) => (p.rellamar_hora ? p.rellamar_hora.slice(0, 5) : "99:99");
    const cmpFinal = filtroEstado === "rellamar"
      ? (a: PersonaListado, b: PersonaListado) =>
          claveHora(a).localeCompare(claveHora(b)) || pesoFranja(a) - pesoFranja(b) || cmp(a, b)
      : cmp;
    return [...lista].sort(cmpFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personasListado, filtroEstado, filtroZona, filtroPoblacion, filtroFranja, searchTerm, orden, hoy]);

  const totalPages = Math.ceil(filtradas.length / PERSONAS_PER_PAGE);
  const paginadas = filtradas.slice((currentPage - 1) * PERSONAS_PER_PAGE, currentPage * PERSONAS_PER_PAGE);

  // ─── Acciones ──────────────────────────────────────────────────────────

  const handleCall = async (p: PersonaListado) => {
    const metodo = await confirmarLlamada(p.telefono);
    if (metodo === "cancelado") return;
    try {
      const { persona: actualizada, llamadaId } = await registrarLlamada(p);
      setLlamadaActualId(llamadaId);
      setTrasLlamada(true);
      setEditing(actualizada);
    } catch {
      toast.error("No se pudo registrar la llamada");
    }
  };

  const handleAdoptar = async (p: PersonaListado) => {
    if (!listadoActual) return;
    if (!confirm(`¿Adoptar a ${nombreCompleto(p)}?\n\nPasará a tus clientes (Contactos) con su nota.`)) return;
    setBusyId(p.id);
    try {
      const r = await adoptarPersona(p, listadoActual.nombre);
      if (r.nuevo) toast.success(`${nombreCompleto(p)} ya está en tus clientes`);
      else toast.success(`Ya existía como cliente (${r.clienteExistente}). Le he añadido la nota.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al pasarla a clientes");
    } finally {
      setBusyId(null);
    }
  };

  const cambiarEstado = async (p: PersonaListado, estado: EstadoPersona, mensaje: string) => {
    setBusyId(p.id);
    try {
      await actualizarPersona(p.id, { estado });
      toast.success(mensaje);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setBusyId(null);
    }
  };

  const handleDescartar = (p: PersonaListado) => {
    if (!confirm(`¿Descartar a ${nombreCompleto(p)}?\n\nDesaparecerá de pendientes. Si vuelve a salir en otro listado, te avisaré.`)) return;
    cambiarEstado(p, "descartado", "Descartada");
  };

  const handleTieneComercial = async (p: PersonaListado) => {
    const comercial = prompt(
      `${nombreCompleto(p)} ya tiene comercial.\n\n¿Cómo se llama su comercial? (si no lo sabes, déjalo en blanco)`
    );
    if (comercial === null) return;
    const nota = `${formatDia(hoy)}: ya tiene comercial${comercial.trim() ? ` (${comercial.trim()})` : ""}`;
    setBusyId(p.id);
    try {
      await actualizarPersona(p.id, { estado: "comercial", notas: p.notas ? `${p.notas}\n${nota}` : nota });
      toast.success("Pasada a «Tiene comercial»");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setBusyId(null);
    }
  };

  // Datos de las que tienen comercial, para pegarlos en WhatsApp o en un correo.
  const copiarDatosComercial = async () => {
    const texto = filtradas
      .filter((p) => p.estado === "comercial")
      .map((p) => [nombreCompleto(p), p.telefono, p.poblacion, p.notas?.replace(/\n/g, " · ")].filter(Boolean).join(" — "))
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Datos copiados: pégalos donde quieras");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const handleRenombrar = async (l: Listado) => {
    const nombre = prompt("Nuevo nombre del listado:", l.nombre)?.trim();
    if (!nombre || nombre === l.nombre) return;
    try {
      await renombrarListado(l.id, nombre);
      toast.success("Listado renombrado");
    } catch {
      toast.error("Error al renombrar");
    }
  };

  const handleBorrarListado = async (l: Listado) => {
    if (!confirm(
      `¿Borrar el listado "${l.nombre}"?\n\n` +
      `Se borran las personas pendientes y adoptadas de este listado (las adoptadas siguen en tus clientes). ` +
      `Las descartadas se guardan ocultas para seguir avisándote si vuelven a aparecer.`
    )) return;
    try {
      await borrarListado(l.id);
      toast.success("Listado borrado");
    } catch {
      toast.error("Error al borrar el listado");
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando listados...</p>
        </div>
      </div>
    );
  }

  const acciones = (p: PersonaListado) => (
    <div className="flex justify-end gap-1">
      {p.estado !== "descartado" && p.estado !== "comercial" && (
        <button onClick={() => handleCall(p)} className="p-2 hover:bg-sky-100 rounded transition" title="Llamar">
          <Phone className="w-4 h-4 text-sky-600" />
        </button>
      )}
      <button
        onClick={() => { setTrasLlamada(false); setEditing(p); }}
        className="p-2 hover:bg-blue-100 rounded transition"
        title="Notas / corregir datos"
      >
        <Edit className="w-4 h-4 text-blue-600" />
      </button>
      {p.estado === "pendiente" && (
        <>
          <button
            onClick={() => handleAdoptar(p)}
            disabled={busyId === p.id}
            className="p-2 hover:bg-green-100 rounded transition disabled:opacity-40"
            title="Adoptar (pasar a clientes)"
          >
            <UserCheck className="w-4 h-4 text-green-600" />
          </button>
          <button
            onClick={() => handleTieneComercial(p)}
            disabled={busyId === p.id}
            className="p-2 hover:bg-purple-100 rounded transition disabled:opacity-40"
            title="Ya tiene comercial"
          >
            <Briefcase className="w-4 h-4 text-purple-600" />
          </button>
          <button
            onClick={() => handleDescartar(p)}
            disabled={busyId === p.id}
            className="p-2 hover:bg-red-100 rounded transition disabled:opacity-40"
            title="Descartar"
          >
            <UserX className="w-4 h-4 text-red-600" />
          </button>
        </>
      )}
      {(p.estado === "descartado" || p.estado === "comercial") && (
        <button
          onClick={() => cambiarEstado(p, "pendiente", "Vuelve a pendientes")}
          disabled={busyId === p.id}
          className="p-2 hover:bg-amber-100 rounded transition disabled:opacity-40"
          title="Recuperar (volver a pendientes)"
        >
          <RotateCcw className="w-4 h-4 text-amber-600" />
        </button>
      )}
    </div>
  );

  const infoLlamadas = (p: PersonaListado) =>
    p.llamadas > 0 ? `${p.llamadas} ${p.llamadas === 1 ? "llamada" : "llamadas"} · ${formatFecha(p.ultima_llamada)}` : "Sin llamar";

  const marcaLlamadaHoy = (p: PersonaListado) =>
    llamadaHoy(p) ? (
      <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-green-600 text-white">✓ Llamada hoy</span>
    ) : null;

  const etiquetaFranja = (p: PersonaListado) => {
    if (p.estado !== "pendiente") return null;
    if (p.rellamar_hora && p.rellamar_el) {
      const hora = p.rellamar_hora.slice(0, 5);
      const pasada = p.rellamar_el < fechaISO() || (p.rellamar_el === fechaISO() && hora < horaDentroDe(0));
      return (
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${pasada ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800"}`}
          title={pasada ? "Ya es la hora de llamarla" : "Hora para volver a llamarla"}
        >
          ⏰ {hora}
        </span>
      );
    }
    return p.franja ? (
      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700" title="Mejor hora para llamarla">
        {FRANJA_LABEL[p.franja]}
      </span>
    ) : null;
  };

  const avisoYaEnContactos = (p: PersonaListado) => {
    if (p.estado === "adoptado") return null;
    const c = clientesPorTel.get(normalizarTelefono(p.telefono));
    if (!c) return null;
    const u = ultimaActividad(interacciones, c.id);
    return (
      <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 whitespace-normal" role="note">
        <p className="font-semibold">👤 Ya en Contactos: {c.nombre}</p>
        {u && <p>Última vez: {u.cuando} · {u.tipo} · {u.texto}</p>}
        <p>Pulsa adoptar 👤✓ para enlazarla (no se duplica).</p>
      </div>
    );
  };

  const avisoRellamar = (p: PersonaListado) => {
    const r = estadoRellamada(p, hoy);
    if (!r || !p.rellamar_el) return etiquetaFranja(p);
    return (
      <span className="inline-flex flex-wrap gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          r === "hoy" ? "bg-green-50 text-green-800" : "bg-muted text-muted-foreground"
        }`}
        title="Día para volver a llamar"
      >
        <CalendarClock className="w-3 h-3" />
        {p.rellamar_el < hoy ? `Tocaba el ${formatDia(p.rellamar_el)}` : p.rellamar_el === hoy ? "Rellamar hoy" : `Rellamar ${formatDia(p.rellamar_el)}`}
      </span>
      {etiquetaFranja(p)}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <CabeceraFormacion icono={IconoCabecera} titulo="Listados" subtitulo="Potenciales clientes para llamar. Cada listado va por separado." />
        <div className="flex gap-2">
          <BotonPromos className="flex-1 md:flex-none" />
          <Button onClick={() => setImportOpen(true)} className="flex-1 md:flex-none bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" />
            Nuevo listado
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 text-sm text-red-700 space-y-2">
          <p className="font-medium">No se han podido cargar los listados.</p>
          <p>
            Si es la primera vez, falta crear las tablas en Supabase (archivo <code>crear_listados.sql</code>).
            Detalle: {error}
          </p>
          <Button size="sm" variant="outline" onClick={() => loadAll()}>Reintentar</Button>
        </Card>
      )}

      {!error && listados.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Todavía no tienes listados.</p>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Crear el primero
          </Button>
        </Card>
      )}

      {listadoActual && (
        <>
          {/* Selector de listado */}
          <div className="flex gap-2 flex-wrap">
            {listados.map((l) => {
              const activo = l.id === listadoActual.id;
              const pendientes = pendientesPorListado.get(l.id) ?? 0;
              return (
                <button
                  key={l.id}
                  onClick={() => { setListadoId(l.id); setFiltroPoblacion(""); setFiltroZona(""); }}
                  className={`px-3 py-2 rounded-lg border text-sm transition ${
                    activo
                      ? "bg-primary text-primary-foreground border-primary shadow"
                      : "bg-background hover:bg-muted border-input"
                  }`}
                >
                  <span className="font-medium">{l.nombre}</span>
                  <span className={`ml-2 text-xs ${activo ? "opacity-90" : "text-muted-foreground"}`}>
                    {pendientes} pend.
                  </span>
                </button>
              );
            })}
          </div>

          {/* Resumen del listado */}
          <Card className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-bold">{listadoActual.nombre}</h2>
                  <button onClick={() => handleRenombrar(listadoActual)} className="p-1 hover:bg-muted rounded" title="Renombrar">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleBorrarListado(listadoActual)} className="p-1 hover:bg-red-100 rounded" title="Borrar listado">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Creado el {new Date(listadoActual.created_at).toLocaleDateString("es-ES")}</p>
              </div>
              <div className="flex gap-2 flex-wrap text-sm">
                <button
                  onClick={() => setFiltroEstado("rellamar")}
                  className={`px-3 py-1 rounded-full font-medium inline-flex items-center gap-1 ${
                    contadores.rellamar > 0 ? "bg-green-50 text-green-800" : "bg-muted text-muted-foreground"
                  } ${filtroEstado === "rellamar" ? "ring-2 ring-offset-1 ring-current" : ""}`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  Rellamar hoy ({contadores.rellamar})
                </button>
                {contadores.programadas > 0 && (
                  <button
                    onClick={() => setFiltroEstado("programadas")}
                    className={`px-3 py-1 rounded-full font-medium bg-muted text-muted-foreground ${filtroEstado === "programadas" ? "ring-2 ring-offset-1 ring-current" : ""}`}
                  >
                    {contadores.programadas} para otro día
                  </button>
                )}
                {(["pendiente", "adoptado", "descartado", "comercial"] as EstadoPersona[]).map((e) => (
                  <button
                    key={e}
                    onClick={() => setFiltroEstado(e)}
                    className={`px-3 py-1 rounded-full font-medium ${ESTADO_COLORS[e]} ${filtroEstado === e ? "ring-2 ring-offset-1 ring-current" : ""}`}
                  >
                    {contadorEstado(e, contadores[e])}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, teléfono, población o notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={filtroZona}
                onChange={(e) => { setFiltroZona(e.target.value); setFiltroPoblacion(""); }}
                className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
                aria-label="Zona"
              >
                <option value="">Todas las zonas</option>
                {zonas.map(([z, n]) => (
                  <option key={z} value={z}>{z} ({n})</option>
                ))}
              </select>
              <select
                value={filtroPoblacion}
                onChange={(e) => setFiltroPoblacion(e.target.value)}
                className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="">Todas las poblaciones</option>
                {poblaciones.map(([key, { label, count }]) => (
                  <option key={key} value={key}>{label} ({count})</option>
                ))}
                {/* La población elegida se mantiene al cambiar de estado, aunque ahí no haya nadie. */}
                {filtroPoblacion && !poblaciones.some(([key]) => key === filtroPoblacion) && (
                  <option value={filtroPoblacion}>
                    {personasListado.find((p) => clavePoblacion(p.poblacion) === filtroPoblacion)?.poblacion.trim() || filtroPoblacion} (0)
                  </option>
                )}
              </select>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
                className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="pendiente">Pendientes de llamar</option>
                <option value="sinllamar">Sin llamar todavía</option>
                <option value="rellamar">Rellamar hoy</option>
                <option value="programadas">Rellamar otro día</option>
                <option value="adoptado">Adoptados</option>
                <option value="descartado">Descartados</option>
                <option value="comercial">Tienen comercial</option>
                <option value="todos">Todos</option>
              </select>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as Orden)}
                className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="poblacion">Ordenar por población</option>
                <option value="apellidos">Ordenar por apellidos</option>
                <option value="nombre">Ordenar por nombre</option>
                <option value="llamada">Sin llamar primero</option>
              </select>
            </div>
            {filtroEstado === "comercial" && filtradas.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button size="sm" variant="outline" onClick={copiarDatosComercial} className="gap-2">
                  <Copy className="w-4 h-4" /> Copiar datos ({filtradas.length})
                </Button>
                <span className="text-muted-foreground">Nombre, teléfono, población y notas, para pegarlos en WhatsApp o en un correo.</span>
              </div>
            )}
            {filtroEstado === "rellamar" && (
              <div className="flex gap-2 flex-wrap text-sm">
                {([
                  ["", `Todas (${contadores.rellamar})`],
                  ["manana", `${FRANJA_LABEL.manana} (${contadores.rellamarManana})`],
                  ["tarde", `${FRANJA_LABEL.tarde} (${contadores.rellamarTarde})`],
                ] as [Franja | "", string][]).map(([valor, texto]) => (
                  <Button
                    key={valor || "todas"}
                    size="sm"
                    variant={filtroFranja === valor ? "default" : "outline"}
                    onClick={() => setFiltroFranja(valor)}
                  >
                    {texto}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{filtradas.length} personas</p>
          </Card>

          {/* Tabla — Escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Población</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Apellidos</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Llamadas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginadas.map((p) => (
                    <TableRow key={p.id} className={llamadaHoy(p) ? "bg-green-100 hover:bg-green-100" : undefined}>
                      <TableCell className="font-medium">{p.poblacion || "—"}</TableCell>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>{p.apellidos}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.telefono || "—"}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_COLORS[p.estado]}`}>
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px] space-y-1">
                        {avisoYaEnContactos(p)}
                        <p className="line-clamp-2 whitespace-pre-line" title={p.notas ?? ""}>{p.notas || "—"}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap space-y-1">
                        {marcaLlamadaHoy(p)}
                        <p>{infoLlamadas(p)}</p>
                        {avisoRellamar(p)}
                      </TableCell>
                      <TableCell className="text-right">{acciones(p)}</TableCell>
                    </TableRow>
                  ))}
                  {paginadas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No hay nadie con estos filtros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Tarjetas — Móvil */}
          <div className="md:hidden space-y-3">
            {paginadas.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No hay nadie con estos filtros</p>
              </Card>
            )}
            {paginadas.map((p) => (
              <Card key={p.id} className={`p-4 space-y-2 ${llamadaHoy(p) ? "bg-green-100 border-green-400" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground">{nombreCompleto(p)}</h3>
                    <p className="text-sm text-muted-foreground">{p.poblacion || "Sin población"} · {p.telefono || "sin teléfono"}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded shrink-0 ${ESTADO_COLORS[p.estado]}`}>
                    {ESTADO_LABEL[p.estado]}
                  </span>
                </div>
                {marcaLlamadaHoy(p)}
                {avisoYaEnContactos(p)}
                {avisoRellamar(p)}
                {p.notas && <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-3">{p.notas}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{infoLlamadas(p)}</span>
                  {acciones(p)}
                </div>
              </Card>
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <Button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
                <Button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      <EditarPersonaDialog
        persona={editing}
        trasLlamada={trasLlamada}
        onClose={() => setEditing(null)}
        onSave={async (updates, notaLlamada) => {
          if (!editing) return;
          await actualizarPersona(editing.id, updates);
          if (trasLlamada && llamadaActualId && notaLlamada) await anotarLlamada(llamadaActualId, notaLlamada);
          toast.success("Guardado");
          setEditing(null);
        }}
      />

      <ImportarListadoDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        personas={personas}
        listados={listados}
        nombreListado={nombreListado}
        onCrear={async (nombre, filas) => {
          const nuevo = await crearListado(nombre, filas);
          setListadoId(nuevo.id);
          setFiltroEstado("pendiente");
          setFiltroPoblacion(""); setFiltroZona("");
          toast.success(`Listado "${nombre}" creado con ${filas.length} personas`);
        }}
        onAnadir={async (id, filas) => {
          await anadirAListado(id, filas);
          setListadoId(id);
          setFiltroEstado("pendiente");
          setFiltroPoblacion(""); setFiltroZona("");
          toast.success(`${filas.length} personas añadidas a "${nombreListado(id)}"`);
        }}
        onAnadirNotas={async (cambios) => {
          for (const { persona, nota } of cambios) {
            const actual = persona.notas?.trim();
            if (actual && actual.includes(nota)) continue;
            await actualizarPersona(persona.id, { notas: actual ? `${actual}\n${nota}` : nota });
          }
          toast.success(`Notas añadidas a ${cambios.length} ${cambios.length === 1 ? "persona" : "personas"}`);
        }}
      />
    </div>
  );
}

// ─── Diálogo: notas y corrección de datos ────────────────────────────────

function EditarPersonaDialog({
  persona,
  trasLlamada,
  onClose,
  onSave,
}: {
  persona: PersonaListado | null;
  trasLlamada: boolean;
  onClose: () => void;
  onSave: (updates: Partial<PersonaListado>, notaLlamada?: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    nombre: "", apellidos: "", telefono: "", poblacion: "", notas: "", rellamar: "", franja: "" as Franja | "", hora: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!persona) return;
    const notas = persona.notas ?? "";
    // Tras una llamada, dejamos preparada una línea con la fecha de hoy.
    const hoy = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    setForm({
      nombre: persona.nombre,
      apellidos: persona.apellidos,
      telefono: persona.telefono,
      poblacion: persona.poblacion,
      notas: trasLlamada ? `${notas ? notas + "\n" : ""}${hoy}: ` : notas,
      // Tras llamar, la rellamada anterior ya está hecha. Se propone volver a llamar
      // en 2 días, así sale de "Pendientes" hasta entonces ("Sin fecha" la deja ahí).
      rellamar: trasLlamada ? sumarDias(2) : persona.rellamar_el ?? "",
      // La preferencia de hora se mantiene entre llamadas hasta que se cambie.
      franja: persona.franja ?? "",
      // La hora concreta es de esa rellamada: tras una nueva llamada se elige otra.
      hora: trasLlamada ? "" : (persona.rellamar_hora ?? "").slice(0, 5),
    });
  }, [persona, trasLlamada]);

  const guardar = async () => {
    const hoy = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    let notas = form.notas.trim();
    if (notas.endsWith(`${hoy}:`)) notas = notas.slice(0, -`${hoy}:`.length).trim(); // línea de fecha sin rellenar
    setSaving(true);
    try {
      await onSave({
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        telefono: form.telefono.trim(),
        poblacion: form.poblacion.trim(),
        notas: notas || null,
        // Con hora concreta y sin día, es para hoy.
        rellamar_el: form.rellamar || (form.hora ? fechaISO() : null),
        franja: form.hora ? franjaDeHora(form.hora) : form.franja || null,
        rellamar_hora: form.hora || null,
      }, trasLlamada ? notaDeEstaLlamada(persona?.notas ?? "", notas, hoy) : undefined);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!persona} onOpenChange={(open) => !open && onClose()}>
      {/* Tras llamar, un clic fuera (al volver del teléfono) no la cierra: solo Guardar o Cancelar. */}
      <DialogContent className="max-w-md" onInteractOutside={(e) => trasLlamada && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {trasLlamada ? `¿Cómo ha ido con ${persona?.nombre}?` : persona ? nombreCompleto(persona) : ""}
          </DialogTitle>
          {persona && (
            <DialogDescription className="space-y-1">
              {persona.telefono && (
                <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Phone className="w-4 h-4 text-sky-600" />
                  {persona.telefono.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}
                  {persona.poblacion && <span className="font-normal text-muted-foreground">· {persona.poblacion}</span>}
                </span>
              )}
              {trasLlamada && <span className="block">Apunta el resultado de la llamada.</span>}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="notas-persona">Notas</Label>
            <Textarea
              id="notas-persona"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Ej: no contesta, volver a llamar el jueves"
              rows={4}
              autoFocus
            />
          </div>
          <div className={trasLlamada ? "rounded-lg border border-gray-200 bg-gray-50 p-3" : ""}>
            <Label htmlFor="p-rellamar">{trasLlamada ? "📞 ¿Cuándo la vuelves a llamar?" : "Volver a llamar"}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {[
                { label: "Hoy", dias: 0 },
                { label: "Mañana", dias: 1 },
                { label: "En 2 días", dias: 2 },
                { label: "En 1 semana", dias: 7 },
              ].map(({ label, dias }) => {
                const fecha = sumarDias(dias);
                return (
                  <Button
                    key={dias}
                    type="button"
                    size="sm"
                    variant={form.rellamar === fecha ? "default" : "outline"}
                    onClick={() => setForm({ ...form, rellamar: fecha })}
                  >
                    {label}
                  </Button>
                );
              })}
              <Input
                id="p-rellamar"
                type="date"
                value={form.rellamar}
                min={fechaISO()}
                onChange={(e) => setForm({ ...form, rellamar: e.target.value })}
                className="w-auto h-9"
                aria-label="Elegir día para volver a llamar"
              />
              {form.rellamar && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, rellamar: "", hora: "" })}>
                  Sin fecha
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {form.rellamar || form.hora
                ? `Saldrá en "Rellamar hoy" el ${formatDia(form.rellamar || fechaISO())}${form.hora ? ` a las ${form.hora}` : ""}.${trasLlamada ? " Hasta entonces no sale en Pendientes." : ""}`
                : "Sin fecha: se queda en pendientes."}
            </p>
          </div>
          <div>
            <Label>¿A qué hora?</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {([
                ["", "Cualquier hora"],
                ["manana", FRANJA_LABEL.manana],
                ["tarde", FRANJA_LABEL.tarde],
              ] as [Franja | "", string][]).map(([valor, texto]) => (
                <Button
                  key={valor || "cualquiera"}
                  type="button"
                  size="sm"
                  variant={!form.hora && form.franja === valor ? "default" : "outline"}
                  onClick={() => setForm({ ...form, franja: valor, hora: "" })}
                >
                  {texto}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm({ ...form, rellamar: fechaISO(), hora: horaDentroDe(60) })}
              >
                ⏰ En 1 hora
              </Button>
              <Input
                type="time"
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value, rellamar: form.rellamar || fechaISO() })}
                className={`w-auto h-9 ${form.hora ? "border-primary" : ""}`}
                aria-label="Hora concreta para volver a llamar"
              />
            </div>
          </div>
          <details open={!trasLlamada} className="space-y-3">
            <summary className="text-sm text-muted-foreground cursor-pointer">Corregir datos</summary>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label htmlFor="p-nombre">Nombre</Label>
                <Input id="p-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-apellidos">Apellidos</Label>
                <Input id="p-apellidos" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-telefono">Teléfono</Label>
                <Input id="p-telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="p-poblacion">Población</Label>
                <Input id="p-poblacion" value={form.poblacion} onChange={(e) => setForm({ ...form, poblacion: e.target.value })} />
              </div>
            </div>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: crear listado pegando el texto ─────────────────────────────

function ImportarListadoDialog({
  open,
  onClose,
  personas,
  listados,
  nombreListado,
  onCrear,
  onAnadir,
  onAnadirNotas,
}: {
  open: boolean;
  onClose: () => void;
  personas: PersonaListado[];
  listados: Listado[];
  nombreListado: (id: number | null) => string;
  onCrear: (nombre: string, filas: FilaListado[]) => Promise<void>;
  onAnadir: (listadoId: number, filas: FilaListado[]) => Promise<void>;
  onAnadirNotas: (cambios: { persona: PersonaListado; nota: string }[]) => Promise<void>;
}) {
  const [paso, setPaso] = useState<"pegar" | "revisar">("pegar");
  // "nuevo" = crear un listado; un número = añadir a ese listado (otra hoja del mismo).
  const [destino, setDestino] = useState<"nuevo" | number>("nuevo");
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<FilaListado[]>([]);
  const [avisos, setAvisos] = useState<Aviso[][]>([]);
  const [incluidas, setIncluidas] = useState<Set<number>>(new Set());
  // Personas que ya están en el listado de destino (mismo teléfono): no se
  // vuelven a añadir; si la fila trae nota, se les añade la nota.
  const [yaEnListado, setYaEnListado] = useState<(PersonaListado | undefined)[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (open) {
      setPaso("pegar");
      setDestino("nuevo");
      setNombre("");
      setTexto("");
      setFilas([]);
      setAvisos([]);
      setIncluidas(new Set());
      setYaEnListado([]);
    }
  }, [open]);

  const revisar = async () => {
    if (destino === "nuevo" && !nombre.trim()) {
      toast.error("Ponle un nombre al listado");
      return;
    }
    let destinoEfectivo = destino;
    if (destino === "nuevo") {
      const existente = listados.find((l) => normalizarNombre(l.nombre) === normalizarNombre(nombre));
      if (existente) {
        // Mismo nombre = mismo listado: lo añadimos ahí en vez de crear otro igual.
        destinoEfectivo = existente.id;
        setDestino(existente.id);
        toast.info(`Ya tienes un listado "${existente.nombre}". Lo añado a ese.`);
      }
    }
    const f = parsearListado(texto);
    if (f.length === 0) {
      toast.error("No he encontrado personas en el texto pegado");
      return;
    }
    setTrabajando(true);
    try {
      const clientes = await fetchClientesBasicos();
      const a = detectarDuplicados(f, clientes, personas, nombreListado);
      const ya = f.map((fila) => {
        const tel = normalizarTelefono(fila.telefono);
        if (destinoEfectivo === "nuevo" || tel.length < 6) return undefined;
        return personas.find((p) => p.listado_id === destinoEfectivo && normalizarTelefono(p.telefono) === tel);
      });
      setFilas(f);
      setAvisos(a);
      setYaEnListado(ya);
      setIncluidas(new Set(f.map((_, i) => i).filter((i) => (ya[i] ? !!f[i].notas : !a[i].some((x) => x.grave)))));
      setPaso("revisar");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo comprobar si hay duplicados");
    } finally {
      setTrabajando(false);
    }
  };

  const guardar = async () => {
    const { nuevas, notas } = seleccionar();
    if (nuevas.length === 0 && notas.length === 0) {
      toast.error("No hay ninguna persona marcada");
      return;
    }
    setTrabajando(true);
    try {
      if (notas.length > 0) await onAnadirNotas(notas);
      if (nuevas.length > 0) {
        if (destino === "nuevo") await onCrear(nombre.trim(), nuevas);
        else await onAnadir(destino, nuevas);
      }
      onClose();
    } catch (err) {
      console.error(err);
      // Enseñamos el motivo real (p. ej. el que devuelve Supabase) para poder arreglarlo.
      const motivo = (err as { message?: string; details?: string })?.message ?? String(err);
      toast.error(`Error al guardar el listado: ${motivo}`, { duration: 20000 });
    } finally {
      setTrabajando(false);
    }
  };

  const seleccionar = () => {
    const nuevas: FilaListado[] = [];
    const notas: { persona: PersonaListado; nota: string }[] = [];
    filas.forEach((f, i) => {
      if (!incluidas.has(i)) return;
      const persona = yaEnListado[i];
      if (!persona) nuevas.push(f);
      else if (f.notas) notas.push({ persona, nota: f.notas });
    });
    return { nuevas, notas };
  };

  const toggle = (i: number) =>
    setIncluidas((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const conAviso = avisos.filter((a) => a.length > 0).length;
  const nombreDestino = destino === "nuevo" ? nombre.trim() : nombreListado(destino);
  const resumen = seleccionar();
  const textoGuardar = resumen.notas.length === 0
    ? `Guardar ${resumen.nuevas.length} personas`
    : resumen.nuevas.length === 0
      ? `Añadir ${resumen.notas.length} notas`
      : `Guardar ${resumen.nuevas.length} personas y ${resumen.notas.length} notas`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !trabajando && onClose()}>
      <DialogContent className={paso === "revisar" ? "max-w-5xl max-h-[90vh] overflow-y-auto" : "max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{paso === "pegar" ? "Nuevo listado" : `Revisar "${nombreDestino}"`}</DialogTitle>
          <DialogDescription>
            {paso === "pegar"
              ? "Pega el listado (una persona por línea: Nombre | Apellidos | Teléfono | Población)."
              : `${filas.length} personas leídas · ${conAviso} con aviso · ${incluidas.size} marcadas para guardar. ` +
                "Los que ya son clientes, ya descartaste o están repetidos salen desmarcados."}
          </DialogDescription>
        </DialogHeader>

        {paso === "pegar" ? (
          <div className="space-y-4">
            {listados.length > 0 && (
              <div>
                <Label htmlFor="destino-listado">¿Dónde lo guardo?</Label>
                <select
                  id="destino-listado"
                  value={String(destino)}
                  onChange={(e) => setDestino(e.target.value === "nuevo" ? "nuevo" : Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md bg-background text-foreground"
                >
                  <option value="nuevo">Crear un listado nuevo</option>
                  {listados.map((l) => (
                    <option key={l.id} value={l.id}>Añadir a "{l.nombre}"</option>
                  ))}
                </select>
              </div>
            )}
            {destino === "nuevo" && (
              <div>
                <Label htmlFor="nombre-listado">Nombre del listado</Label>
                <Input
                  id="nombre-listado"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder='Ej: Listado feria octubre'
                />
              </div>
            )}
            <div>
              <Label htmlFor="texto-listado">Personas</Label>
              <Textarea
                id="texto-listado"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={"María | García López | 612345678 | Sitges\nJuan | Pérez | 698765432 | Vilanova i la Geltrú"}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Apellidos</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Población</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Avisos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f, i) => (
                <TableRow key={i} className={incluidas.has(i) ? "" : "opacity-50"}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={incluidas.has(i)}
                      onChange={() => toggle(i)}
                      className="w-4 h-4 accent-primary"
                      aria-label={`Incluir ${f.nombre}`}
                    />
                  </TableCell>
                  <TableCell>{f.nombre}</TableCell>
                  <TableCell>{f.apellidos}</TableCell>
                  <TableCell className="whitespace-nowrap">{f.telefono}</TableCell>
                  <TableCell>{f.poblacion}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {f.notas}
                    {(f.rellamar_el || f.franja || f.llamadas) && (
                      <p className="text-amber-700">
                        {[
                          f.llamadas ? "Ya llamada" : "",
                          f.rellamar_el ? `Rellamar ${formatDia(f.rellamar_el)}` : "",
                          f.franja ? FRANJA_LABEL[f.franja] : "",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs space-y-1">
                    {yaEnListado[i] && (
                      <p className={`flex items-start gap-1 font-medium ${f.notas ? "text-sky-700" : "text-red-600"}`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {f.notas
                          ? "Ya está en este listado: solo se le añadirá la nota"
                          : "Ya está en este listado: no se vuelve a añadir"}
                      </p>
                    )}
                    {avisos[i]?.map((a, j) => (
                      <p key={j} className={`flex items-start gap-1 ${a.grave ? "text-red-600" : "text-amber-600"}`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {a.texto}
                      </p>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          {paso === "pegar" ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={revisar} disabled={trabajando}>{trabajando ? "Comprobando..." : "Revisar duplicados"}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPaso("pegar")} disabled={trabajando}>Volver</Button>
              <Button onClick={guardar} disabled={trabajando}>
                {trabajando ? "Guardando..." : textoGuardar}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
