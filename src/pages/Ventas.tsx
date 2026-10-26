import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, CheckCircle2, Clock, ShoppingBag, PartyPopper, X, Edit2 } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { useSupabaseVentas, type Venta } from "@/hooks/useSupabaseVentas";
import { useContacts } from "@/hooks/useContacts";
import { coincideBusqueda } from "@/lib/listados";
import { fiscalMonthOf, fiscalMonthBounds, previousFiscalMonth } from "@/utils/fiscalMonth";
import { toast } from "sonner";

const MODELOS = ["TM7", "TM6", "TM5", "Otros"];
const RESULTADO_LABELS: Record<string, string> = {
  pendiente_bienvenida: "Pendiente bienvenida",
  bienvenida_realizada: "Bienvenida realizada",
};

export default function Ventas() {
  const { ventas, addVenta, updateVenta, deleteVenta } = useSupabaseVentas();
  
  // Calcular stats desde ventas. Usamos MES FISCAL Thermomix (no calendario):
  // los ciclos van de día-tras-cierre-anterior hasta día-de-cierre-actual,
  // donde el día de cierre lo define Thermomix por mes y año (ver
  // `src/utils/fiscalMonth.ts`).
  const stats = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    const fmAnterior = previousFiscalMonth(fmActual);
    const { start: inicioMes, endExclusive: inicioMesSiguiente } = fiscalMonthBounds(fmActual);
    const { start: inicioMesAnterior, endExclusive: finMesAnteriorExc } = fiscalMonthBounds(fmAnterior);

    const ventasMes = ventas.filter((v) => {
      const d = new Date(v.fecha_venta);
      return d >= inicioMes && d < inicioMesSiguiente;
    }).length;

    const ventasMesAnterior = ventas.filter((v) => {
      const d = new Date(v.fecha_venta);
      return d >= inicioMesAnterior && d < finMesAnteriorExc;
    }).length;

    const bienvenidsPendientes = ventas.filter(
      (v) => !v.bienvenida_realizada
    );

    // Solo cuentan las bienvenidas con fecha DENTRO del mes fiscal actual
    // (ni antes ni después).
    const bienvendidasMes = ventas.filter((v) => {
      if (!v.bienvenida_realizada || !v.fecha_bienvenida) return false;
      const d = new Date(v.fecha_bienvenida);
      return d >= inicioMes && d < inicioMesSiguiente;
    }).length;

    return {
      ventasMes,
      ventasMesAnterior,
      bienvenidsPendientes,
      bienvendidasMes,
      totalVentas: ventas.length,
    };
  }, [ventas]);
  const { contacts } = useContacts();

  const [showForm, setShowForm] = useState(false);
  const [editingVenta, setEditingVenta] = useState<Venta | null>(null);
  const [filterTab, setFilterTab] = useState<"todas" | "pendientes" | "realizadas">("todas");

  // Form state
  const [contactoBusqueda, setContactoBusqueda] = useState("");
  const [contactoSeleccionado, setContactoSeleccionado] = useState<typeof contacts[0] | null>(null);
  const [modelo, setModelo] = useState("TM7");
  const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split("T")[0]);
  const [fechaBienvenida, setFechaBienvenida] = useState("");
  const [notas, setNotas] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Diálogo para confirmar la fecha al marcar "Bienvenida hecha".
  // Por defecto sugerimos la fecha programada de la venta, o hoy si no hay.
  const [marcarBienvenidaVenta, setMarcarBienvenidaVenta] = useState<Venta | null>(null);
  const [fechaBienvenidaMarcar, setFechaBienvenidaMarcar] = useState<string>("");

  // Referencia al formulario para hacer scroll hasta él al abrirse. Si no se
  // hace scroll, cuando estás leyendo una venta al final de la lista y pulsas
  // "Editar", el formulario se abre arriba del todo fuera de la vista y parece
  // que no pasa nada.
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm, editingVenta]);

  const contactosFiltrados = useMemo(() => {
    if (!contactoBusqueda || contactoBusqueda.length < 2) return [];
    return contacts
      .filter((c) => coincideBusqueda(contactoBusqueda, c.nombre, c.telefono))
      .slice(0, 6);
  }, [contacts, contactoBusqueda]);

  const ventasFiltradas = useMemo(() => {
    if (filterTab === "pendientes") return ventas.filter((v) => !v.bienvenida_realizada);
    if (filterTab === "realizadas") return ventas.filter((v) => v.bienvenida_realizada);
    return [...ventas].sort((a, b) => new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime());
  }, [ventas, filterTab]);

  const resetForm = () => {
    setContactoBusqueda("");
    setContactoSeleccionado(null);
    setModelo("TM7");
    setFechaVenta(new Date().toISOString().split("T")[0]);
    setFechaBienvenida("");
    setNotas("");
    setEditingVenta(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!fechaVenta) {
      toast.error("Indica la fecha de la venta");
      return;
    }

    if (editingVenta) {
      // En modo edición el contacto ya está asociado a la venta; no requerimos
      // contactoSeleccionado porque el campo cliente es de solo lectura aquí.
      try {
        await updateVenta(editingVenta.id, {
          modelo,
          fecha_venta: fechaVenta,
          fecha_bienvenida: fechaBienvenida || null,
          notas,
        });
        toast.success("Venta actualizada");
        resetForm();
      } catch (e) {
        console.error("Error actualizando venta:", e);
        toast.error("No se pudo actualizar. Inténtalo de nuevo.");
      }
      return;
    }

    // Creación de venta nueva: sí necesitamos contacto seleccionado.
    if (!contactoSeleccionado) {
      toast.error("Selecciona un contacto");
      return;
    }

    try {
      await addVenta({
        contacto_id: contactoSeleccionado.id,
        contacto_nombre: contactoSeleccionado.nombre,
        contacto_telefono: contactoSeleccionado.telefono,
        contacto_ubicacion: contactoSeleccionado.ubicacion,
        modelo,
        fecha_venta: fechaVenta,
        fecha_bienvenida: fechaBienvenida || null,
        bienvenida_realizada: false,
        notas,
      });
      toast.success(`Venta de ${modelo} registrada para ${contactoSeleccionado.nombre}`);
      resetForm();
    } catch (e) {
      console.error("Error creando venta:", e);
      toast.error("No se pudo registrar. Inténtalo de nuevo.");
    }
  };

  const handleEditVenta = (venta: Venta) => {
    setEditingVenta(venta);
    setContactoBusqueda(venta.contacto_nombre);
    setContactoSeleccionado({
      id: venta.contacto_id,
      nombre: venta.contacto_nombre,
      telefono: venta.contacto_telefono,
      ubicacion: venta.contacto_ubicacion,
      modelo: venta.modelo,
      intereses: [] as string[],
      notas: "",
      ultimoContacto: "",
      zonaPlaya: false,
      sinContactar: false,
      recibeDifusion: false,
      // Campos requeridos por el tipo Contact pero que no están en `Venta`
      // (no los necesitamos para el modo edición del formulario, donde el
      // campo cliente es de solo lectura). Defaulteo a "" para satisfacer el
      // tipo sin romper el flujo de edición.
      origen: "",
      estado_lead: "",
      recomendada_por: null,
    });
    setModelo(venta.modelo);
    setFechaVenta(venta.fecha_venta);
    setFechaBienvenida(venta.fecha_bienvenida || "");
    setNotas(venta.notas);
    setShowForm(true);
  };

  // Abre el diálogo para confirmar la fecha. Por defecto usamos la fecha
  // programada de la venta si la hay; si no, hoy.
  const handleMarcarBienvenida = (venta: Venta) => {
    const hoy = new Date().toISOString().split("T")[0];
    setFechaBienvenidaMarcar(venta.fecha_bienvenida || hoy);
    setMarcarBienvenidaVenta(venta);
  };

  // Confirma con la fecha elegida en el diálogo.
  const handleConfirmarBienvenida = async () => {
    if (!marcarBienvenidaVenta) return;
    if (!fechaBienvenidaMarcar) {
      toast.error("Indica la fecha de la bienvenida");
      return;
    }
    try {
      await updateVenta(marcarBienvenidaVenta.id, {
        bienvenida_realizada: true,
        fecha_bienvenida: fechaBienvenidaMarcar,
      });
      toast.success(`Bienvenida realizada para ${marcarBienvenidaVenta.contacto_nombre} 🎉`);
      setMarcarBienvenidaVenta(null);
      setFechaBienvenidaMarcar("");
    } catch (e) {
      console.error("Error marcando bienvenida:", e);
      toast.error("No se pudo guardar. Inténtalo de nuevo.");
    }
  };

  // Revertir el estado de bienvenida hecha (por si se marcó por error o queremos
  // cambiar la fecha y volverla a confirmar). No toca la fecha_bienvenida:
  // solo desmarca, para que luego la usuaria pueda editar todo y confirmar cuando quiera.
  const handleDesmarcarBienvenida = (venta: Venta) => {
    if (!confirm(`¿Desmarcar la bienvenida de ${venta.contacto_nombre}? Volverá a estar pendiente.`)) return;
    updateVenta(venta.id, { bienvenida_realizada: false });
    toast.success(`Bienvenida de ${venta.contacto_nombre} marcada como pendiente`);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  const diasHastaBienvenida = (fechaBienvenida: string | null) => {
    if (!fechaBienvenida) return null;
    const hoy = new Date();
    const fecha = new Date(fechaBienvenida);
    const diff = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <CabeceraFormacion
          icono={ShoppingBag}
          titulo="Ventas y bienvenidas"
          subtitulo="Registro de ventas y seguimiento de bienvenidas"
        />
        <Button onClick={() => setShowForm(true)} className="gap-2 w-full md:w-auto">
          <Plus size={16} /> Nueva Venta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-white">
          <p className="text-xs text-muted-foreground uppercase font-medium">Ventas este mes</p>
          <p className="text-3xl font-bold text-gray-800">{stats.ventasMes}</p>
          {stats.ventasMesAnterior > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              vs {stats.ventasMesAnterior} el mes anterior
            </p>
          )}
        </Card>
        <Card className="p-4 bg-white">
          <p className="text-xs text-muted-foreground uppercase font-medium">Bienvenidas pendientes</p>
          <p className="text-3xl font-bold text-gray-800">{stats.bienvenidsPendientes.length}</p>
        </Card>
        <Card className="p-4 bg-white">
          <p className="text-xs text-muted-foreground uppercase font-medium">Bienvenidas este mes</p>
          <p className="text-3xl font-bold text-gray-800">{stats.bienvendidasMes}</p>
        </Card>
        <Card className="p-4 bg-white">
          <p className="text-xs text-muted-foreground uppercase font-medium">Total ventas</p>
          <p className="text-3xl font-bold text-gray-800">{stats.totalVentas}</p>
        </Card>
      </div>

      {/* Formulario nueva venta */}
      {showForm && (
        <Card ref={formRef} className="p-6 border-2 border-primary/20 bg-primary/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">{editingVenta ? "Editar venta" : "Registrar nueva venta"}</h2>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Búsqueda de contacto */}
            <div className="relative md:col-span-2">
              <label className="text-sm font-medium mb-1 block">Cliente *</label>
              <Input
                placeholder="Buscar por nombre o teléfono..."
                value={contactoBusqueda}
                // En modo edición el cliente no se puede cambiar (evita perder
                // el contactoSeleccionado al enfocar/escribir). La venta ya está
                // asociada al contacto original.
                readOnly={!!editingVenta}
                disabled={!!editingVenta}
                onChange={(e) => {
                  if (editingVenta) return;
                  setContactoBusqueda(e.target.value);
                  setContactoSeleccionado(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => { if (!editingVenta) setShowSuggestions(true); }}
                className={editingVenta ? "bg-muted cursor-not-allowed" : ""}
              />
              {editingVenta && (
                <p className="text-xs text-muted-foreground mt-1">
                  El cliente no se puede cambiar al editar. Si fuese otro, borra esta venta y crea una nueva.
                </p>
              )}
              {!editingVenta && showSuggestions && contactosFiltrados.length > 0 && !contactoSeleccionado && (
                <div className="absolute z-10 w-full bg-background border border-input rounded-md shadow-lg mt-1">
                  {contactosFiltrados.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex justify-between"
                      onClick={() => {
                        setContactoSeleccionado(c);
                        setContactoBusqueda(c.nombre);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-muted-foreground">{c.ubicacion}</span>
                    </button>
                  ))}
                </div>
              )}
              {contactoSeleccionado && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} /> {contactoSeleccionado.ubicacion} · {contactoSeleccionado.telefono}
                </p>
              )}
            </div>

            {/* Modelo */}
            <div>
              <label className="text-sm font-medium mb-1 block">Modelo *</label>
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              >
                {MODELOS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Fecha venta */}
            <div>
              <label className="text-sm font-medium mb-1 block">Fecha de venta *</label>
              <Input
                type="date"
                value={fechaVenta}
                onChange={(e) => setFechaVenta(e.target.value)}
              />
            </div>

            {/* Fecha bienvenida */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Fecha prevista de bienvenida
                <span className="text-xs text-muted-foreground ml-1">(opcional)</span>
              </label>
              <Input
                type="date"
                value={fechaBienvenida}
                onChange={(e) => setFechaBienvenida(e.target.value)}
              />
            </div>

            {/* Notas */}
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-1 block">Notas</label>
              <Textarea
                placeholder="Forma de pago, accesorios incluidos, observaciones..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="min-h-20"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSubmit} className="flex-1">
              {editingVenta ? "Guardar cambios" : "Registrar venta"}
            </Button>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* Tabs filtro */}
      <div className="flex gap-2 border-b">
        {[
          { id: "todas", label: `Todas (${ventas.length})` },
          { id: "pendientes", label: `Bienvenidas pendientes (${stats.bienvenidsPendientes.length})` },
          { id: "realizadas", label: "Completadas" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista de ventas */}
      {ventasFiltradas.length === 0 ? (
        <Card className="p-12 text-center bg-gray-50 border-dashed">
          <ShoppingBag className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-lg font-medium text-muted-foreground">
            {filterTab === "pendientes" ? "No hay bienvenidas pendientes" : "No hay ventas registradas"}
          </p>
          {filterTab === "todas" && (
            <p className="text-sm text-muted-foreground mt-1">
              Pulsa "Nueva Venta" para registrar tu primera venta
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {ventasFiltradas.map((venta) => {
            const dias = diasHastaBienvenida(venta.fecha_bienvenida);
            const bienvenidaUrgente = dias !== null && dias <= 3 && !venta.bienvenida_realizada;
            return (
              <Card
                key={venta.id}
                className={`p-4 flex flex-col md:flex-row md:items-center gap-4 border-l-4 ${
                  venta.bienvenida_realizada
                    ? "border-l-green-400 bg-white"
                    : bienvenidaUrgente
                    ? "border-l-red-500 bg-white"
                    : "border-l-gray-300 bg-white"
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">{venta.contacto_nombre}</span>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded">
                      {venta.modelo}
                    </span>
                    {venta.bienvenida_realizada ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded flex items-center gap-1">
                        <CheckCircle2 size={10} /> Bienvenida hecha
                      </span>
                    ) : bienvenidaUrgente ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
                        ⚠️ Bienvenida en {dias} días
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded flex items-center gap-1">
                        <Clock size={10} /> Bienvenida pendiente
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {venta.contacto_ubicacion} · Venta: {formatDate(venta.fecha_venta)}
                    {venta.fecha_bienvenida && (
                      <> · Bienvenida: {formatDate(venta.fecha_bienvenida)}</>
                    )}
                  </div>
                  {venta.notas && (
                    <p className="text-xs text-muted-foreground italic">{venta.notas}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!venta.bienvenida_realizada && (
                    <Button
                      size="sm"
                      className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleMarcarBienvenida(venta)}
                    >
                      <PartyPopper size={14} /> Bienvenida hecha
                    </Button>
                  )}
                  {venta.bienvenida_realizada && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                      onClick={() => handleDesmarcarBienvenida(venta)}
                      title="Marcar como pendiente de nuevo"
                    >
                      <Clock size={14} /> Desmarcar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => handleEditVenta(venta)}
                    title="Editar venta (fecha, modelo, notas...)"
                  >
                    <Edit2 size={14} /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm("¿Eliminar esta venta?")) {
                        deleteVenta(venta.id);
                        toast.success("Venta eliminada");
                      }
                    }}
                    title="Eliminar venta"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo para confirmar fecha al marcar Bienvenida hecha */}
      {marcarBienvenidaVenta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-2">
                <PartyPopper className="text-green-600" size={20} />
                <div>
                  <h2 className="font-bold text-base">Bienvenida realizada</h2>
                  <p className="text-xs text-muted-foreground">{marcarBienvenidaVenta.contacto_nombre}</p>
                </div>
              </div>
              <button
                onClick={() => { setMarcarBienvenidaVenta(null); setFechaBienvenidaMarcar(""); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Fecha de la bienvenida</label>
                <Input
                  type="date"
                  value={fechaBienvenidaMarcar}
                  onChange={(e) => setFechaBienvenidaMarcar(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {marcarBienvenidaVenta.fecha_bienvenida
                    ? "Sugerida: la fecha programada de esta venta. Puedes cambiarla."
                    : "No había fecha programada, se sugiere la de hoy."}
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <Button onClick={handleConfirmarBienvenida} className="flex-1 bg-green-600 hover:bg-green-700">
                  <PartyPopper size={16} className="mr-2" /> Confirmar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setMarcarBienvenidaVenta(null); setFechaBienvenidaMarcar(""); }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
