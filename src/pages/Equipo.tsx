import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, MessageCircle, Copy, Search, Star } from "lucide-react";
import { UsersRound as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { toast } from "sonner";
import {
  useSupabaseEquipo,
  type Agente,
  type AgenteInput,
  type EstadoAgente,
  type TipoNotaEquipo,
} from "@/hooks/useSupabaseEquipo";

// En la base de datos el estado se sigue llamando "activa", pero en pantalla es
// «Vigente»: «Activa» en Thermomix es cuando ya ha hecho alguna venta (22/10/2026).
const ESTADOS: { value: EstadoAgente; label: string; color: string }[] = [
  { value: "activa", label: "Vigente", color: "bg-green-100 text-green-700" },
  { value: "pendiente_firma", label: "Pendiente de firma", color: "bg-gray-100 text-gray-700" },
  { value: "caducada", label: "Caducada", color: "bg-gray-100 text-gray-500" },
];
const estadoInfo = (e: EstadoAgente) => ESTADOS.find((x) => x.value === e) ?? ESTADOS[0];

const TIPOS_NOTA: { value: TipoNotaEquipo; label: string; emoji: string }[] = [
  { value: "nota", label: "Nota", emoji: "📝" },
  { value: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { value: "llamada", label: "Llamada", emoji: "📞" },
  { value: "venta", label: "Venta a su nombre", emoji: "🛒" },
];

const formatFecha = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

/** Días que faltan hasta la fecha límite (negativo si ya ha pasado). */
function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(fecha + "T00:00:00").getTime() - hoy.getTime()) / 86400000);
}

// Plantillas de WhatsApp para el equipo. {nombre} y {limite} se rellenan solos;
// lo que va entre [corchetes] lo completa Rosalía antes de enviar.
const PLANTILLAS: { id: string; titulo: string; texto: string }[] = [
  {
    id: "bienvenida",
    titulo: "Bienvenida",
    texto:
      "¡Hola {nombre}! Bienvenida al equipo. Cualquier duda que tengas con la Thermomix, con Cookidoo o con cómo funciona todo, escríbeme cuando quieras. Esta semana te llamo y nos organizamos.",
  },
  {
    id: "formacion",
    titulo: "Formación / reunión",
    texto:
      "Hola {nombre}, te cuento: el [día] a las [hora] hay [formación/reunión] en la delegación ([dirección]). ¿Te va bien venir?",
  },
  {
    id: "venta",
    titulo: "Felicitar una venta",
    texto: "¡Enhorabuena por la venta, {nombre}! Gracias por tu trabajo. Si necesitas algo para la entrega o la bienvenida, me dices.",
  },
  {
    id: "plazo",
    titulo: "Plazo de las 4 Thermomix",
    texto:
      "Hola {nombre}, para que lo tengas en cuenta: el plazo para tus 4 Thermomix acaba el {limite}. Si tienes a alguien interesado, lo miramos juntas.",
  },
  {
    id: "promo",
    titulo: "Promo del mes",
    texto:
      "Hola {nombre}, este mes la promo es: [escribe aquí la promo]. Si conoces a alguien a quien le pueda interesar, dímelo y lo hablamos.",
  },
  { id: "libre", titulo: "Mensaje libre", texto: "Hola {nombre}, " },
];

const formVacio: AgenteInput = {
  nombre: "",
  telefono: "",
  email: "",
  zona: "",
  tipo: "apoyo",
  estado: "activa",
  fecha_alta: null,
  fecha_limite: null,
  contacto_id: null,
  notas: "",
};

export default function Equipo() {
  const { agentes, notas, loading, error, guardarAgente, borrarAgente, anadirNota, borrarNota } = useSupabaseEquipo();
  const [busqueda, setBusqueda] = useState("");
  const [verCaducadas, setVerCaducadas] = useState(false);

  // Ficha abierta
  const [fichaId, setFichaId] = useState<number | null>(null);
  const ficha = agentes.find((a) => a.id === fichaId) ?? null;

  // Formulario alta / edición
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<AgenteInput>(formVacio);
  const [guardando, setGuardando] = useState(false);

  // WhatsApp y notas dentro de la ficha
  const [plantillaId, setPlantillaId] = useState("libre");
  const [mensaje, setMensaje] = useState("");
  const [tipoNota, setTipoNota] = useState<TipoNotaEquipo>("nota");
  const [textoNota, setTextoNota] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    const orden: Record<EstadoAgente, number> = { activa: 0, pendiente_firma: 1, caducada: 2 };
    return agentes
      .filter((a) => verCaducadas || a.estado !== "caducada")
      .filter((a) => !q || a.nombre.toLowerCase().includes(q) || (a.zona ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "real" ? -1 : 1) || orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  }, [agentes, busqueda, verCaducadas]);

  const numCaducadas = agentes.filter((a) => a.estado === "caducada").length;
  const numVigentes = agentes.filter((a) => a.estado === "activa").length;
  // Activa = vigente y con al menos una venta.
  const conVentas = (id: number) => notas.some((n) => n.agente_id === id && n.tipo === "venta");
  const numActivas = agentes.filter((a) => a.estado === "activa" && conVentas(a.id)).length;

  const rellenar = (texto: string, a: Agente) =>
    texto
      .replace(/\{nombre\}/g, a.nombre.split(" ")[0])
      .replace(/\{limite\}/g, a.fecha_limite ? formatFecha(a.fecha_limite) : "[fecha]");

  const abrirFicha = (a: Agente) => {
    setFichaId(a.id);
    setPlantillaId("libre");
    setMensaje(rellenar(PLANTILLAS.find((p) => p.id === "libre")!.texto, a));
    setTextoNota("");
    setTipoNota("nota");
  };

  const elegirPlantilla = (id: string) => {
    setPlantillaId(id);
    const p = PLANTILLAS.find((x) => x.id === id);
    if (p && ficha) setMensaje(rellenar(p.texto, ficha));
  };

  const abrirNueva = () => {
    setEditandoId(null);
    setForm(formVacio);
    setFormAbierto(true);
  };

  const abrirEditar = (a: Agente) => {
    setEditandoId(a.id);
    setForm({
      nombre: a.nombre,
      telefono: a.telefono ?? "",
      email: a.email ?? "",
      zona: a.zona ?? "",
      tipo: a.tipo,
      estado: a.estado,
      fecha_alta: a.fecha_alta,
      fecha_limite: a.fecha_limite,
      contacto_id: a.contacto_id,
      notas: a.notas ?? "",
    });
    setFormAbierto(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      const limpio = (s: string | null) => (s && s.trim()) || null;
      await guardarAgente(
        {
          ...form,
          nombre: form.nombre.trim(),
          telefono: limpio(form.telefono),
          email: limpio(form.email),
          zona: limpio(form.zona),
          notas: limpio(form.notas),
          fecha_alta: form.fecha_alta || null,
          fecha_limite: form.fecha_limite || null,
        },
        editandoId ?? undefined
      );
      toast.success(editandoId ? "Ficha actualizada" : "Agente añadida al equipo");
      setFormAbierto(false);
    } catch {
      toast.error("No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (a: Agente, estado: EstadoAgente) => {
    try {
      const { id: _id, created_at: _c, updated_at: _u, ...datos } = a;
      await guardarAgente({ ...datos, estado }, a.id);
      toast.success(estado === "caducada" ? `${a.nombre} marcada como caducada` : `${a.nombre} vuelve a estar vigente`);
      if (estado === "caducada" && !verCaducadas) setFichaId(null);
    } catch {
      toast.error("No se ha podido cambiar");
    }
  };

  const eliminar = async (a: Agente) => {
    if (!confirm(`¿Borrar la ficha de ${a.nombre} y todo su historial? Si ya no vende, mejor pulsa «Marcar como caducada».`)) return;
    try {
      await borrarAgente(a.id);
      setFichaId(null);
      toast.success("Ficha borrada");
    } catch {
      toast.error("No se ha podido borrar");
    }
  };

  const enviarWhatsApp = async () => {
    if (!ficha?.telefono) return;
    const phone = ficha.telefono.replace(/[^\d+]/g, "");
    const conPrefijo = phone.startsWith("+") || phone.length > 9 ? phone.replace("+", "") : "34" + phone;
    window.open(`https://wa.me/${conPrefijo}?text=${encodeURIComponent(mensaje)}`);
    try {
      await anadirNota(ficha.id, "whatsapp", mensaje);
    } catch {
      toast.error("Se ha abierto WhatsApp, pero no se ha podido guardar en el historial");
    }
  };

  const copiarMensaje = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se ha podido copiar");
    }
  };

  const guardarNota = async () => {
    if (!ficha || !textoNota.trim()) return;
    try {
      await anadirNota(ficha.id, tipoNota, textoNota.trim());
      setTextoNota("");
      toast.success("Guardado en el historial");
    } catch {
      toast.error("No se ha podido guardar la nota");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando equipo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="p-6 text-center text-muted-foreground">{error}</Card>
      </div>
    );
  }

  const notasFicha = ficha ? notas.filter((n) => n.agente_id === ficha.id) : [];
  const ventasFicha = notasFicha.filter((n) => n.tipo === "venta").length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <CabeceraFormacion icono={IconoCabecera} titulo="Equipo" subtitulo={`${numVigentes} vigentes · ${numActivas} ${numActivas === 1 ? "activa" : "activas"} (con venta) · ${agentes.length} en total`} />
        <Button onClick={abrirNueva} className="w-full md:w-auto gap-2">
          <Plus className="w-4 h-4" />
          Nueva agente
        </Button>
      </div>

      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o zona..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-10" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <input type="checkbox" checked={verCaducadas} onChange={(e) => setVerCaducadas(e.target.checked)} />
          Ver también las caducadas ({numCaducadas})
        </label>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visibles.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">No hay agentes que mostrar</Card>}
        {visibles.map((a) => {
          const dias = a.estado === "activa" ? diasHasta(a.fecha_limite) : null;
          const ventas = notas.filter((n) => n.agente_id === a.id && n.tipo === "venta").length;
          return (
            <Card
              key={a.id}
              onClick={() => abrirFicha(a)}
              className={`p-4 space-y-2 cursor-pointer hover:shadow-md transition ${a.estado === "caducada" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-foreground flex items-center gap-1">
                  {a.tipo === "real" && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
                  {a.nombre}
                </h3>
                {a.estado === "activa" && ventas > 0 ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap bg-green-600 text-white" title="Vigente y con alguna venta">✓ Activa</span>
                ) : (
                  <span className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap ${estadoInfo(a.estado).color}`}>{estadoInfo(a.estado).label}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">{a.tipo === "real" ? "Agente real" : "De apoyo"}</span>
                {a.zona && <span className="px-2 py-0.5 rounded bg-muted">{a.zona}</span>}
                {a.fecha_alta && <span className="px-2 py-0.5 rounded bg-muted">Alta {formatFecha(a.fecha_alta)}</span>}
                {ventas > 0 && <span className="px-2 py-0.5 rounded bg-muted">🛒 {ventas}</span>}
              </div>
              {a.estado === "activa" && (
                <p className={`text-xs ${dias !== null && dias <= 15 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  {dias === null
                    ? "Plazo de las 4 Thermomix: sin fecha"
                    : dias < 0
                    ? `El plazo acabó el ${formatFecha(a.fecha_limite)}`
                    : `Plazo hasta el ${formatFecha(a.fecha_limite)} (quedan ${dias} días)`}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Ficha de la agente */}
      <Dialog open={ficha !== null} onOpenChange={(o) => !o && setFichaId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {ficha && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {ficha.tipo === "real" && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
                  {ficha.nombre}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-1 text-sm">
                <p>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${estadoInfo(ficha.estado).color}`}>{estadoInfo(ficha.estado).label}</span>{" "}
                  <span className="text-muted-foreground">{ficha.tipo === "real" ? "Agente real" : "De apoyo"}</span>
                </p>
                <p className="text-muted-foreground">📞 {ficha.telefono || "sin teléfono"} · ✉️ {ficha.email || "sin correo"}</p>
                <p className="text-muted-foreground">
                  Alta: {formatFecha(ficha.fecha_alta)} · Plazo 4 Thermomix: {formatFecha(ficha.fecha_limite)} · Ventas apuntadas: {ventasFicha}
                </p>
                {ficha.notas && <p className="whitespace-pre-wrap bg-muted/50 rounded p-2">{ficha.notas}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirEditar(ficha)}>
                    <Edit className="w-3.5 h-3.5" /> Editar ficha
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => cambiarEstado(ficha, ficha.estado === "caducada" ? "activa" : "caducada")}>
                    {ficha.estado === "caducada" ? "Volver a ponerla vigente" : "Marcar como caducada"}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => eliminar(ficha)}>
                    <Trash2 className="w-3.5 h-3.5" /> Borrar
                  </Button>
                </div>
              </div>

              {/* Preparar WhatsApp */}
              <div className="border-t pt-3 space-y-2">
                <Label>Preparar mensaje</Label>
                <select value={plantillaId} onChange={(e) => elegirPlantilla(e.target.value)} className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm">
                  {PLANTILLAS.map((p) => (
                    <option key={p.id} value={p.id}>{p.titulo}</option>
                  ))}
                </select>
                <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} />
                {mensaje.includes("[") && <p className="text-xs text-amber-600">Completa lo que está entre [corchetes] antes de enviar.</p>}
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" disabled={!ficha.telefono} onClick={enviarWhatsApp}>
                    <MessageCircle className="w-4 h-4" /> Abrir en WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={copiarMensaje}>
                    <Copy className="w-4 h-4" /> Copiar
                  </Button>
                </div>
                {!ficha.telefono && <p className="text-xs text-muted-foreground">Añade su teléfono en «Editar ficha» para poder abrir WhatsApp.</p>}
              </div>

              {/* Historial */}
              <div className="border-t pt-3 space-y-2">
                <Label>Historial</Label>
                <div className="flex gap-2">
                  <select value={tipoNota} onChange={(e) => setTipoNota(e.target.value as TipoNotaEquipo)} className="px-2 py-2 border border-input rounded-md bg-background text-foreground text-sm">
                    {TIPOS_NOTA.map((t) => (
                      <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                  <Input
                    value={textoNota}
                    onChange={(e) => setTextoNota(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && guardarNota()}
                    placeholder={tipoNota === "venta" ? "Clienta, fecha, modelo..." : "Qué ha pasado..."}
                  />
                  <Button size="sm" onClick={guardarNota} disabled={!textoNota.trim()}>Guardar</Button>
                </div>
                {notasFicha.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay nada apuntado.</p>}
                <ul className="space-y-2">
                  {notasFicha.map((n) => (
                    <li key={n.id} className="text-sm flex gap-2 items-start">
                      <span>{TIPOS_NOTA.find((t) => t.value === n.tipo)?.emoji}</span>
                      <div className="flex-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(n.fecha).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <p className="whitespace-pre-wrap">{n.notas}</p>
                      </div>
                      <button
                        onClick={() => confirm("¿Borrar esta nota?") && borrarNota(n.id).catch(() => toast.error("No se ha podido borrar"))}
                        className="p-1 hover:bg-red-100 rounded"
                        title="Borrar"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alta / edición */}
      <Dialog open={formAbierto} onOpenChange={setFormAbierto}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar ficha" : "Nueva agente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="eq-nombre">Nombre *</Label>
              <Input id="eq-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="eq-tel">Teléfono</Label>
                <Input id="eq-tel" value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="eq-zona">Zona</Label>
                <Input id="eq-zona" value={form.zona ?? ""} onChange={(e) => setForm({ ...form, zona: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="eq-email">Correo</Label>
              <Input id="eq-email" type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="eq-tipo">Tipo</Label>
                <select id="eq-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as AgenteInput["tipo"] })} className="w-full mt-1 px-3 py-2 border border-input rounded-md bg-background text-foreground">
                  <option value="real">Agente real</option>
                  <option value="apoyo">De apoyo</option>
                </select>
              </div>
              <div>
                <Label htmlFor="eq-estado">Estado</Label>
                <select id="eq-estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoAgente })} className="w-full mt-1 px-3 py-2 border border-input rounded-md bg-background text-foreground">
                  {ESTADOS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="eq-alta">Fecha de alta</Label>
                <Input id="eq-alta" type="date" value={form.fecha_alta ?? ""} onChange={(e) => setForm({ ...form, fecha_alta: e.target.value || null })} />
              </div>
              <div>
                <Label htmlFor="eq-limite">Plazo 4 Thermomix</Label>
                <Input id="eq-limite" type="date" value={form.fecha_limite ?? ""} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value || null })} />
              </div>
            </div>
            <div>
              <Label htmlFor="eq-notas">Notas</Label>
              <Textarea id="eq-notas" rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
