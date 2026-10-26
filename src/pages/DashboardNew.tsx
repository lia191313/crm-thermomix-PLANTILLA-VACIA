import { useState, useMemo, useEffect, useCallback } from "react";
import { calcularProximosClientes } from "@/lib/proximosClientes";
import { esContactoReal } from "@/lib/marcas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, MessageCircle, Calendar, Clock, CheckCircle2, AlertCircle, TrendingUp, Users, ExternalLink, User, Star, Home, ShoppingBag, PartyPopper, Award, BarChart3 } from "lucide-react";
import { useContacts } from "@/hooks/useContacts";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useReminders } from "@/hooks/useReminders";
import { useRellamar } from "@/hooks/useRellamar";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { useDemos } from "@/hooks/useDemos";
import { useDashboardSnooze } from "@/hooks/useDashboardSnooze";
import ModalAnotacion from "@/components/ModalAnotacion";
import ModalDemo from "@/components/ModalDemo";
import ContactadosDetailModal from "@/components/ContactadosDetailModal";
import { isZonaPlaya } from "@/utils/zonaPlaya";
import { fiscalMonthOf, fiscalMonthBounds, isInFiscalMonth } from "@/utils/fiscalMonth";
import { toast } from "sonner";
import { confirmarLlamada } from "@/lib/callDialog";
import RellamarHoyCard from "@/components/RellamarHoyCard";
import RecordatoriosHoyCard from "@/components/RecordatoriosHoyCard";
import { TMX, TituloSeccion, CabeceraFormacion } from "@/components/EstiloFormacion";

interface DashboardProps {
  onViewContact?: (id: number) => void;
  onNavigate?: (section: string) => void;
}

export default function Dashboard({ onViewContact, onNavigate }: DashboardProps) {
  const { contacts, loading, updateContact } = useContacts();
  const { stats, contactos, addContacto, getDiasDesdeUltimoContacto, forceRefresh } = useLlamadasGlobales();
  const { reminders } = useReminders();
  const { rellamarIds, esRellamar, toggleRellamar, quitarRellamar } = useRellamar();
  const { ventas } = useSupabaseVentas();
  
  // Calcular stats desde ventas, usando MES FISCAL Thermomix.
  const statsVentas = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    const { start: inicioMes, endExclusive: inicioMesSiguiente } = fiscalMonthBounds(fmActual);

    const ventasMes = ventas.filter((v) => {
      const d = new Date(v.fecha_venta);
      return d >= inicioMes && d < inicioMesSiguiente;
    }).length;

    const bienvenidsPendientes = ventas.filter(
      (v) => !v.bienvenida_realizada
    );
    
    return {
      ventasMes,
      bienvenidsPendientes,
      totalVentas: ventas.length,
    };
  }, [ventas]);
  const { demos, stats: statsDemos } = useDemos();

  const [showModalAnotacion, setShowModalAnotacion] = useState(false);
  const [showModalDemo, setShowModalDemo] = useState(false);
  const [showContactadosModal, setShowContactadosModal] = useState(false);
  const [contactadosModalType, setContactadosModalType] = useState<'hoy' | 'mes'>('hoy');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedContactNombre, setSelectedContactNombre] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [rellamarDialogData, setRellamarDialogData] = useState<{ id: number; nombre: string; telefono: string } | null>(null);
  const [fechaRellamarInput, setFechaRellamarInput] = useState("");
  const { isSnoozed, snooze, clearSnooze } = useDashboardSnooze();
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState<number | null>(null);

  // Recalcular cuando cambian los datos o se fuerza refresco
  useEffect(() => {
    // Este efecto se ejecuta cuando refreshTrigger cambia
    // Fuerza la recalculación de proximosClientes
    if (refreshTrigger > 0) {
      forceRefresh();
    }
  }, [refreshTrigger, forceRefresh]);


  // Agenda de hoy: el cálculo está en lib/proximosClientes (lo comparte con "Mi día")
  const proximosClientes = useMemo(
    () => calcularProximosClientes({ contacts, rellamarIds, reminders, ventas, demos, getDiasDesdeUltimoContacto, isSnoozed }),
    [contacts, rellamarIds, reminders, getDiasDesdeUltimoContacto, ventas, demos, isSnoozed]
  );

  // Recalcular stats cuando cambian
  const displayStats = useMemo(() => {
    return stats;
  }, [stats]);

  const quitarSinContactar = (id: number) => {
    const contact = contacts.find(c => c.id === id);
    if (contact?.sinContactar) {
      updateContact({ ...contact, sinContactar: false });
    }
  };

  const handleLlamada = useCallback(async (id: number, nombre: string, telefono: string) => {
    try {
      const phone = telefono.replace(/\D/g, "");
      if (phone) {
        const metodo = await confirmarLlamada(phone);
        if (metodo === "cancelado") return;
      }
      await addContacto(id, "llamada", `Llamada realizada desde Dashboard`);
      await quitarRellamar(id);
      quitarSinContactar(id);
      toast.success(`Llamada registrada para ${nombre}`);
      setRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      console.error('Error en handleLlamada:', error);
      toast.error(`Error al registrar llamada: ${error?.message || error}`);
    }
  }, [addContacto, quitarRellamar, contacts, updateContact]);

  const handleWhatsApp = useCallback(async (id: number, nombre: string, telefono: string) => {
    try {
      const phone = telefono.replace(/\D/g, "");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent("Hola, ¿cómo estás?")}`;
      window.open(url, "_blank");
      await addContacto(id, "whatsapp", `WhatsApp enviado desde Dashboard`);
      await quitarRellamar(id);
      quitarSinContactar(id);
      toast.success(`WhatsApp registrado para ${nombre}`);
      setRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      console.error('Error en handleWhatsApp:', error);
      toast.error(`Error al registrar WhatsApp: ${error?.message || error}`);
    }
  }, [addContacto, quitarRellamar, contacts, updateContact]);

  const handleRellamar = useCallback(async (id: number, nombre: string, telefono: string) => {
    try {
      const estaRellamar = esRellamar(id);
      if (!estaRellamar) {
        setFechaRellamarInput("");
        setRellamarDialogData({ id, nombre, telefono });
      } else {
        const phone = telefono.replace(/\D/g, "");
        if (phone) {
          const metodo = await confirmarLlamada(phone);
          if (metodo === "cancelado") return;
        }
        await addContacto(id, "llamada", `Rellamada realizada desde Dashboard`);
        await toggleRellamar(id);
        toast.success(`Rellamada registrada para ${nombre}`);
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (error: any) {
      console.error('Error en handleRellamar:', error);
      toast.error(`Error al marcar rellamar: ${error?.message || error}`);
    }
  }, [addContacto, toggleRellamar, esRellamar]);

  const handleConfirmarRellamar = async (fecha?: string) => {
    if (!rellamarDialogData) return;
    const { id, nombre } = rellamarDialogData;
    setRellamarDialogData(null);
    try {
      await addContacto(id, "rellamar", `Marcado para rellamar desde Dashboard`);
      await toggleRellamar(id, fecha || null);
      if (fecha) {
        toast.warning(`Rellamar el ${new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} 📞`);
      } else {
        toast.warning(`${nombre} marcado para rellamar 📞`);
      }
      setRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      toast.error(`Error al marcar rellamar: ${error?.message || error}`);
    }
  };

  const handleAbrirAnotacion = useCallback((id: number, nombre: string) => {
    setSelectedContactId(id);
    setSelectedContactNombre(nombre);
    setShowModalAnotacion(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModalAnotacion(false);
    // Forzar refresco cuando se cierra el modal de anotación
    setTimeout(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 100);
  }, []);

  const handleOpenContactadosModal = useCallback((type: 'hoy' | 'mes') => {
    setContactadosModalType(type);
    setShowContactadosModal(true);
  }, []);

  // Crear mapa de contactos para búsqueda rápida
  const contactsMap = useMemo(() => {
    const map = new Map();
    contacts.forEach(c => map.set(c.id, c));
    return map;
  }, [contacts]);

  // IDs de contactos con ⛔ para excluirlos de stats
  const excludedIds = useMemo(() => {
    return new Set(contacts.filter(c => c.nombre.includes('⛔')).map(c => c.id));
  }, [contacts]);

  const activeContacts = useMemo(() => {
    return contacts.filter(c => !c.nombre.includes('⛔'));
  }, [contacts]);

  // Filtrar contactos UNICOS para hoy
  const contactadosHoy = useMemo(() => {
    const hoy = new Date();
    const hoyStr = hoy.toDateString();
    
    const interaccionesHoy = contactos.filter(c => 
      new Date(c.fecha).toDateString() === hoyStr && esContactoReal(c.tipo) && !excludedIds.has(c.contactoId)
    );
    
    const contactosUnicos = Array.from(
      new Map(interaccionesHoy.map((c) => [c.contactoId, c])).values()
    );
    
    return contactosUnicos;
  }, [contactos, excludedIds]);

  // Filtrar contactos UNICOS para el mes fiscal actual.
  const contactadosMes = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    const interaccionesMes = contactos.filter(c =>
      isInFiscalMonth(new Date(c.fecha), fmActual) && esContactoReal(c.tipo) && !excludedIds.has(c.contactoId)
    );

    const contactosUnicos = Array.from(
      new Map(interaccionesMes.map((c) => [c.contactoId, c])).values()
    );

    return contactosUnicos;
  }, [contactos, excludedIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando datos del panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header con Fecha */}
      <CabeceraFormacion
        icono={BarChart3}
        titulo="Panel de control"
        subtitulo={new Date().toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      />

      <RecordatoriosHoyCard onAbrir={() => onNavigate?.("recordatorios")} />
      <RellamarHoyCard onAbrir={() => onNavigate?.("listados")} />

      {/* Tarjetas de Estadísticas Comerciales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white">
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><ShoppingBag size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Ventas mes</p>
            <p className="text-2xl font-bold text-gray-800">{statsVentas.ventasMes}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white">
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><Star size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Demos mes</p>
            <p className="text-2xl font-bold text-gray-800">{statsDemos.demosMes}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white">
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><PartyPopper size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Bienvenidas</p>
            <p className="text-2xl font-bold text-gray-800">{statsVentas.bienvenidsPendientes.length}</p>
            <p className="text-[10px] text-muted-foreground">pendientes</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleOpenContactadosModal('hoy')}>
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><TrendingUp size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Contactos hoy</p>
            <p className="text-2xl font-bold">{contactadosHoy.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleOpenContactadosModal('mes')}>
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><Clock size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Contactos mes</p>
            <p className="text-2xl font-bold">{contactadosMes.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 shadow-sm bg-white">
          <div className="p-2 bg-gray-100 rounded-full text-gray-500"><Users size={18} /></div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">Total clientes</p>
            <p className="text-2xl font-bold">{activeContacts.length}</p>
          </div>
        </Card>
      </div>

      {/* Sección Principal: Próximos Clientes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <TituloSeccion color={TMX.azul} icono={AlertCircle}>
            Agenda de hoy ({proximosClientes.length} {proximosClientes.length === 1 ? "cliente" : "clientes"})
          </TituloSeccion>
          <p className="text-xs text-muted-foreground italic hidden sm:block">Los clientes no contactados permanecerán en tu agenda.</p>
        </div>

        {proximosClientes.length === 0 ? (
          <Card className="p-12 text-center bg-gray-50 border-dashed">
            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} />
            <p className="text-lg font-medium">¡Todo al día!</p>
            <p className="text-muted-foreground">No tienes clientes pendientes de contacto urgente.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {proximosClientes.filter(c => !isSnoozed(c.id)).map((cliente) => {
              const rellamar = esRellamar(cliente.id);
              return (
                <Card
                  key={cliente.id}
                  className={`p-4 hover:shadow-md transition-shadow border-l-4 flex flex-col justify-between group ${
                    cliente.diasSinContacto !== 999 && cliente.diasSinContacto >= 90
                      ? "border-l-red-400 bg-white"
                      : "border-l-gray-300 bg-white"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <button
                        onClick={() => onViewContact?.(cliente.id)}
                        className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
                      >
                        <div className="flex items-center gap-1">
                          {(cliente.modelo === "mio" || cliente.modelo?.startsWith("⭐")) && (
                            <Star size={14} className="text-green-600 flex-shrink-0 fill-green-600" />
                          )}
                          {(cliente.modelo === "cedido" || cliente.nombre.startsWith("[CEDIDO]")) && (
                            <User size={14} className="text-purple-600 flex-shrink-0" />
                          )}
                          {cliente.modelo === "adoptado" && (
                            <Home size={14} className="text-blue-600 flex-shrink-0" />
                          )}
                          <h3 className="font-bold text-base leading-tight truncate max-w-[120px]" title={cliente.nombre}>
                            {cliente.nombre.replace("[CEDIDO] ", "").replace(" THERMOMIX", "").split(" FIRA")[0]}
                          </h3>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase whitespace-nowrap ${
                          cliente.diasSinContacto !== 999 && cliente.diasSinContacto >= 90
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {cliente.diasSinContacto === 999 ? "NUEVO" : `${cliente.diasSinContacto}d`}
                        </span>
                        {rellamar && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-bold rounded uppercase whitespace-nowrap">
                            📞 Rellamar
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mb-3">
                      <p className="text-xs text-muted-foreground truncate">{cliente.ubicacion}</p>
                      {cliente.zonaPlaya && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-bold rounded uppercase w-fit">
                          📍 Mi zona
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-auto">
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 h-8 text-[11px] bg-green-600 hover:bg-green-700 text-white border-green-600"
                        onClick={() => handleLlamada(cliente.id, cliente.nombre, cliente.telefono)}
                        title="Registrar llamada exitosa"
                      >
                        <Phone size={12} /> Llamar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 h-8 text-[11px] border-green-200 hover:bg-green-50 text-green-700"
                        onClick={() => handleWhatsApp(cliente.id, cliente.nombre, cliente.telefono)}
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle size={12} /> WA
                      </Button>
                    </div>
                    {/* Botón Rellamar */}
                    <Button
                      size="sm"
                      className={`w-full h-8 text-[11px] gap-1 font-bold ${
                        rellamar
                          ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                          : "bg-white border border-gray-300 hover:bg-gray-50 text-gray-700"
                      }`}
                      onClick={() => handleRellamar(cliente.id, cliente.nombre, cliente.telefono)}
                      title={rellamar ? "Quitar marca de rellamar" : "Marcar para rellamar (contestador / no disponible)"}
                    >
                      📞 {rellamar ? "Quitar rellamar" : "Rellamar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-[11px] text-gray-600 gap-1 hover:bg-gray-50"
                      onClick={() => { setSelectedContactId(cliente.id); setSelectedContactNombre(cliente.nombre); setShowModalDemo(true); }}
                    >
                      <Award size={14} /> Demo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-[11px] text-gray-500 gap-1"
                      onClick={() => handleAbrirAnotacion(cliente.id, cliente.nombre)}
                    >
                      <Calendar size={14} /> Anotar
                    </Button>

                    {/* Botón Aplazar — inline, sin popup */}
                    {snoozeMenuOpen === cliente.id ? (
                      <div className="flex gap-1 w-full">
                        {([7, 15, 30] as const).map((days) => (
                          <button
                            key={days}
                            className="flex-1 h-8 rounded text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            onClick={() => {
                              snooze(cliente.id, days);
                              setSnoozeMenuOpen(null);
                              toast.success(`${cliente.nombre.split(" ")[0]} aplazado ${days} días 🕐`);
                            }}
                          >
                            {days}d
                          </button>
                        ))}
                        <button
                          className="h-8 w-8 rounded text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                          onClick={() => setSnoozeMenuOpen(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-8 text-[11px] text-slate-400 hover:text-slate-600 gap-1"
                        onClick={() => setSnoozeMenuOpen(cliente.id)}
                        title="Aplazar — quitar de la agenda por unos días"
                      >
                        <Clock size={14} /> Aplazar
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Anotación Unificado */}
      {showModalAnotacion && selectedContactId && (
        <ModalAnotacion
          contactoId={selectedContactId}
          contactoNombre={selectedContactNombre}
          onClose={handleCloseModal}
        />
      )}

      {/* Modal Demo */}
      {showModalDemo && selectedContactId && (
        <ModalDemo
          contactoId={selectedContactId}
          contactoNombre={selectedContactNombre}
          onClose={() => { setShowModalDemo(false); setRefreshTrigger(prev => prev + 1); }}
        />
      )}

      {/* Modal de Detalle de Contactados */}
      {showContactadosModal && (
        <ContactadosDetailModal
          isOpen={showContactadosModal}
          onClose={() => setShowContactadosModal(false)}
          title={contactadosModalType === 'hoy' ? 'Contactos de hoy' : 'Contactos de este mes'}
          contactos={contactadosModalType === 'hoy' ? contactadosHoy : contactadosMes}
          contactsMap={contactsMap}
        />
      )}

      {/* Diálogo para elegir cuándo rellamar */}
      {rellamarDialogData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm space-y-3">
            <p className="font-bold text-gray-900">¿Cuándo quieres rellamar a <span className="text-green-700">{rellamarDialogData.nombre.split(' ')[0]}</span>?</p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
                onClick={() => handleConfirmarRellamar()}
              >
                Cuando pueda
              </button>
              <button
                className={`flex-1 py-2 font-bold rounded-lg border-2 border-gray-300 text-gray-700 ${fechaRellamarInput ? "bg-white hover:bg-gray-50" : "opacity-50 cursor-not-allowed"}`}
                onClick={() => { if (fechaRellamarInput) handleConfirmarRellamar(fechaRellamarInput); }}
                disabled={!fechaRellamarInput}
              >
                Fecha concreta
              </button>
            </div>
            <input
              type="date"
              value={fechaRellamarInput}
              min={new Date().toISOString().split("T")[0]}
              onChange={e => setFechaRellamarInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
              onClick={() => setRellamarDialogData(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
