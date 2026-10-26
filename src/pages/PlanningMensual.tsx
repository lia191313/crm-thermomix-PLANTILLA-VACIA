import { useState, useEffect, useMemo } from "react";
import { noProponerLlamar } from "@/lib/marcas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, MessageCircle, Search, X, FileText, Calendar, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { Calendar as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { useContacts } from "@/hooks/useContacts";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { useRellamar } from "@/hooks/useRellamar";
import ModalAnotacion from "@/components/ModalAnotacion";
import { toast } from "sonner";
import { confirmarLlamada } from "@/lib/callDialog";

interface ClientePlanificado {
  id: number;
  nombre: string;
  telefono: string;
  ubicacion: string;
  modelo: string;
  diasSinContacto: number;
  ultimaLlamada: string | null;
  estado: "urgente" | "esta_semana" | "este_mes" | "contactado" | "rellamar";
  esSinContactar: boolean;
}

function MiniCalendario({
  contactoId,
  mes,
  año,
  getContactosPorContacto,
}: {
  contactoId: number;
  mes: number;
  año: number;
  getContactosPorContacto: (id: number) => any[];
}) {
  const contactos = getContactosPorContacto(contactoId);

  const diasConContacto = useMemo(() => {
    const dias = new Set<number>();
    contactos.forEach((c) => {
      const fecha = new Date(c.fecha);
      if (fecha.getFullYear() === año && fecha.getMonth() === mes) {
        dias.add(fecha.getDate());
      }
    });
    return dias;
  }, [contactos, mes, año]);

  const primerDia = new Date(año, mes, 1).getDay();
  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const primerDiaLunes = primerDia === 0 ? 6 : primerDia - 1;

  const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDiaLunes; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-gray-500 mb-1">{nombresMeses[mes]} {año}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d} className="text-[9px] text-gray-400 font-medium">{d}</span>
        ))}
        {celdas.map((dia, i) => (
          <span
            key={i}
            className={`text-[10px] rounded-sm leading-4 ${
              dia === null ? "" : diasConContacto.has(dia) ? "bg-green-500 text-white font-bold" : "text-gray-400"
            }`}
          >
            {dia ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

interface PlanningMensualProps {
  onViewContact?: (id: number) => void;
}

export default function PlanningMensual({ onViewContact }: PlanningMensualProps) {
  const { contacts, loading, updateContact } = useContacts();
  const { contactos: historialGlobal, addContacto, getUltimoContacto, getDiasDesdeUltimoContacto, getContactosPorContacto, reloadFromStorage } = useLlamadasGlobales();
  const { ventas } = useSupabaseVentas();
  const { esRellamar, toggleRellamar, quitarRellamar } = useRellamar();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [showModalAnotacion, setShowModalAnotacion] = useState(false);
  const [limpiandoSinContactar, setLimpiandoSinContactar] = useState(false);
  const [clienteParaAnotacion, setClienteParaAnotacion] = useState<ClientePlanificado | null>(null);
  const [expandedCalendario, setExpandedCalendario] = useState<number | null>(null);
  const [rellamarDialogCliente, setRellamarDialogCliente] = useState<ClientePlanificado | null>(null);
  const [fechaRellamarInput, setFechaRellamarInput] = useState("");

  const hoy = new Date();
  const [calMes, setCalMes] = useState(hoy.getMonth());
  const [calAño, setCalAño] = useState(hoy.getFullYear());

  useEffect(() => {
    reloadFromStorage();
  }, [reloadFromStorage]);

  const irMesAnterior = () => {
    if (calMes === 0) { setCalMes(11); setCalAño(calAño - 1); }
    else setCalMes(calMes - 1);
  };
  const irMesSiguiente = () => {
    if (calMes === 11) { setCalMes(0); setCalAño(calAño + 1); }
    else setCalMes(calMes + 1);
  };

  // Una venta es, a todos los efectos, un contacto muy reciente (visita en
  // persona para cerrarla) aunque no quede registrada como "llamada" en el
  // historial de interacciones. La usamos para no marcar como urgente a
  // clientes a los que se les acaba de vender un Thermomix.
  const ultimaVentaPorContacto = useMemo(() => {
    const map = new Map<number, string>();
    ventas.forEach((v) => {
      const actual = map.get(v.contacto_id);
      if (!actual || new Date(v.fecha_venta).getTime() > new Date(actual).getTime()) {
        map.set(v.contacto_id, v.fecha_venta);
      }
    });
    return map;
  }, [ventas]);

  const diasDesdeFecha = (fecha: string) => {
    const hoy = new Date();
    const hoyNormalizado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const f = new Date(fecha);
    const fNormalizada = new Date(f.getFullYear(), f.getMonth(), f.getDate());
    const diferenciaMs = hoyNormalizado.getTime() - fNormalizada.getTime();
    return Math.max(0, Math.floor(diferenciaMs / (1000 * 60 * 60 * 24)));
  };

  const clientesPlanificados = useMemo(() => {
    return contacts.filter(contact => !noProponerLlamar(contact.nombre)).map((contact) => {
      const diasSinContactoHistorial = getDiasDesdeUltimoContacto(contact.id);
      const ultimoContacto = getUltimoContacto(contact.id);
      const ultimaVenta = ultimaVentaPorContacto.get(contact.id);
      const diasDesdeVenta = ultimaVenta ? diasDesdeFecha(ultimaVenta) : null;

      // Nos quedamos con el evento más reciente entre la última interacción
      // registrada y la última venta.
      const usarVenta = diasDesdeVenta !== null && diasDesdeVenta < diasSinContactoHistorial;
      const diasSinContacto = usarVenta ? diasDesdeVenta : diasSinContactoHistorial;

      let estado: "urgente" | "esta_semana" | "este_mes" | "contactado" = "urgente";
      if (diasSinContacto < 10) estado = "contactado";
      else if (diasSinContacto < 20) estado = "este_mes";
      else if (diasSinContacto < 30) estado = "esta_semana";

      return {
        id: contact.id,
        nombre: contact.nombre,
        telefono: contact.telefono,
        ubicacion: contact.ubicacion,
        modelo: contact.modelo,
        diasSinContacto,
        ultimaLlamada: usarVenta
          ? `Venta ${new Date(ultimaVenta!).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}`
          : ultimoContacto ? ultimoContacto.fechaLocal : null,
        estado,
        esSinContactar: !!contact.sinContactar,
      };
    }).sort((a, b) => {
      // Primero los que llevan más días sin contacto
      return b.diasSinContacto - a.diasSinContacto;
    });
  }, [contacts, historialGlobal, getDiasDesdeUltimoContacto, getUltimoContacto, ultimaVentaPorContacto]);

  const clientesUrgentes = clientesPlanificados.filter((c) => c.estado === "urgente");
  const clientesContactados = clientesPlanificados.filter((c) => c.estado === "contactado");

  const clientesFiltrados = useMemo(() => {
    let resultado = clientesPlanificados;
    if (searchTerm.trim()) {
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const term = normalize(searchTerm);
      resultado = resultado.filter(c =>
        normalize(c.nombre).includes(term) ||
        c.telefono.includes(searchTerm.trim()) ||
        normalize(c.ubicacion).includes(term)
      );
    }
    if (filtroEstado === "zona_playa") {
      resultado = resultado.filter(c => {
        const contact = contacts.find(ct => ct.id === c.id);
        return !!contact?.zonaPlaya;
      });
    } else if (filtroEstado === "sin_contactar") {
      resultado = resultado.filter(c => {
        const contact = contacts.find(ct => ct.id === c.id);
        return !!contact?.sinContactar;
      });
    } else if (filtroEstado) {
      resultado = resultado.filter(c => c.estado === filtroEstado);
    }
    return resultado;
  }, [clientesPlanificados, contacts, searchTerm, filtroEstado]);

  const limpiarSinContactarYaContactados = async () => {
    setLimpiandoSinContactar(true);
    try {
      const sinContactarContacts = contacts.filter(c => c.sinContactar);
      const aLimpiar = sinContactarContacts.filter(c => {
        const interacciones = getContactosPorContacto(c.id);
        return interacciones.some(i => i.tipo !== "rellamar");
      });
      await Promise.all(aLimpiar.map(c => updateContact({ ...c, sinContactar: false })));
      toast.success(`${aLimpiar.length} contacto${aLimpiar.length !== 1 ? "s" : ""} limpiado${aLimpiar.length !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Error al limpiar contactos");
    } finally {
      setLimpiandoSinContactar(false);
    }
  };

  const quitarSinContactar = (clienteId: number) => {
    const contact = contacts.find(c => c.id === clienteId);
    if (contact?.sinContactar) {
      updateContact({ ...contact, sinContactar: false });
    }
  };

  const handleLlamada = async (cliente: ClientePlanificado) => {
    const numero = cliente.telefono.replace(/\D/g, "");
    const metodo = await confirmarLlamada(numero);
    if (metodo === "cancelado") return;
    addContacto(cliente.id, "llamada", `Llamada realizada a ${cliente.nombre}`);
    quitarRellamar(cliente.id);
    quitarSinContactar(cliente.id);
    toast.success(`Llamada registrada para ${cliente.nombre}`);
  };

  const handleRellamar = (cliente: ClientePlanificado) => {
    if (esRellamar(cliente.id)) {
      toggleRellamar(cliente.id);
      toast.success(`${cliente.nombre} desmarcado de rellamar`);
    } else {
      setFechaRellamarInput("");
      setRellamarDialogCliente(cliente);
    }
  };

  const handleConfirmarRellamar = async (fecha?: string) => {
    if (!rellamarDialogCliente) return;
    setRellamarDialogCliente(null);
    await toggleRellamar(rellamarDialogCliente.id, fecha || null);
    if (fecha) {
      toast.warning(`Rellamar el ${new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} 📞`);
    } else {
      toast.warning(`${rellamarDialogCliente.nombre} marcado para rellamar 📞`);
    }
  };

  const handleWhatsApp = (cliente: ClientePlanificado) => {
    const mensaje = `Hola ${cliente.nombre.split(" ")[0]}, te llamo de Thermomix. ¿Tienes un momento?`;
    const url = `https://wa.me/${cliente.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
    addContacto(cliente.id, "whatsapp", `WhatsApp enviado a ${cliente.nombre}`);
    quitarSinContactar(cliente.id);
    toast.success(`WhatsApp registrado para ${cliente.nombre}`);
  };

  const handleAbrirAnotacion = (cliente: ClientePlanificado) => {
    setClienteParaAnotacion(cliente);
    setShowModalAnotacion(true);
  };

  const renderClienteCard = (cliente: ClientePlanificado) => {
    const estaRellamar = esRellamar(cliente.id);
    let borderColor = "border-gray-300";
    let bgColor = "bg-gray-50";
    // Regla de colores (21/10/2026): blanco; rojo si es urgente, verde si ya está contactada.
    bgColor = "bg-white";
    if (cliente.estado === "urgente") borderColor = "border-red-500";
    else if (cliente.estado === "contactado") borderColor = "border-green-500";
    else borderColor = "border-gray-300";

    const calVisible = expandedCalendario === cliente.id;

    return (
      <Card key={cliente.id} className={`p-4 border-l-4 ${borderColor} ${bgColor} hover:shadow-lg transition-shadow relative overflow-hidden group`}>
        {estaRellamar && (
          <div className="absolute top-0 left-0 bg-gray-200 text-gray-700 px-2 py-0.5 text-[10px] font-bold rounded-br flex items-center gap-1">
            📞 RELLAMAR
          </div>
        )}
        {cliente.esSinContactar && !estaRellamar && (
          <button
            onClick={() => quitarSinContactar(cliente.id)}
            className="absolute top-0 left-0 bg-gray-200 text-gray-700 hover:bg-gray-300 px-2 py-0.5 text-[10px] font-bold rounded-br flex items-center gap-1 transition-colors"
            title="Quitar marca 'Sin contactar'"
          >
            🆕 SIN CONTACTAR ✕
          </button>
        )}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onViewContact?.(cliente.id)}
              className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
            >
              <h3 className="font-bold text-lg truncate">{cliente.nombre}</h3>
              <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
            <p className="text-sm text-gray-600">{cliente.ubicacion}</p>
            <p className="text-xs text-gray-500 mt-1">{cliente.telefono}</p>
            <div className="mt-2">
              <p className={`text-xs font-bold ${cliente.diasSinContacto >= 30 ? "text-red-600" : cliente.diasSinContacto >= 10 ? "text-orange-600" : "text-green-600"}`}>
                {cliente.diasSinContacto >= 999 ? "Sin contacto registrado" : `${cliente.diasSinContacto} días sin contacto`}
              </p>
            </div>
            {cliente.ultimaLlamada && <p className="text-xs text-gray-500">Último: {cliente.ultimaLlamada}</p>}
            <button onClick={() => setExpandedCalendario(calVisible ? null : cliente.id)} className="flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-800">
              <Calendar size={12} /> {calVisible ? "Ocultar calendario" : "Ver calendario del mes"}
            </button>
            {calVisible && (
              <div className="mt-2 bg-white rounded p-2 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <button onClick={irMesAnterior}><ChevronLeft size={14} /></button>
                  <span className="text-xs font-semibold">{calMes + 1}/{calAño}</span>
                  <button onClick={irMesSiguiente}><ChevronRight size={14} /></button>
                </div>
                <MiniCalendario contactoId={cliente.id} mes={calMes} año={calAño} getContactosPorContacto={getContactosPorContacto} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 ml-3">
            <Button size="sm" onClick={() => handleLlamada(cliente)} className="bg-green-600" title="Registrar llamada"><Phone size={16} /></Button>
            <Button size="sm" onClick={() => handleWhatsApp(cliente)} className="bg-white border border-green-300 text-green-700 hover:bg-green-50" title="WhatsApp"><MessageCircle size={16} /></Button>
            <Button
              size="sm"
              onClick={() => handleRellamar(cliente)}
              className={`${estaRellamar ? "bg-gray-300 hover:bg-gray-400" : "bg-white border border-gray-300 hover:bg-gray-50"} text-gray-700 font-bold`}
              title={estaRellamar ? "Quitar marca de rellamar" : "Marcar para rellamar (contestador)"}
            >
              📞
            </Button>
            <Button size="sm" onClick={() => handleAbrirAnotacion(cliente)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50" title="Añadir nota"><FileText size={16} /></Button>
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando planificación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <CabeceraFormacion icono={IconoCabecera} titulo="Planning mensual" />
      <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltroEstado(null)} className={`px-4 py-2 rounded-lg text-sm ${filtroEstado === null ? "bg-green-600 text-white" : "bg-white border"}`}>Todos ({clientesPlanificados.length})</button>
          <button onClick={() => setFiltroEstado("urgente")} className={`px-4 py-2 rounded-lg text-sm ${filtroEstado === "urgente" ? "bg-red-600 text-white" : "bg-white border"}`}>Urgente ({clientesUrgentes.length})</button>
          <button onClick={() => setFiltroEstado("contactado")} className={`px-4 py-2 rounded-lg text-sm ${filtroEstado === "contactado" ? "bg-green-600 text-white" : "bg-white border"}`}>Contactados ({clientesContactados.length})</button>
          <button
            onClick={() => setFiltroEstado("zona_playa")}
            className={`px-4 py-2 rounded-lg text-sm ${filtroEstado === "zona_playa" ? "bg-green-600 text-white" : "bg-white border"}`}
          >
            📍 Mi zona ({clientesPlanificados.filter(c => contacts.find(ct => ct.id === c.id)?.zonaPlaya).length})
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFiltroEstado("sin_contactar")}
              className={`px-4 py-2 rounded-lg text-sm ${filtroEstado === "sin_contactar" ? "bg-green-600 text-white" : "bg-white border"}`}
            >
              🆕 Sin contactar ({clientesPlanificados.filter(c => contacts.find(ct => ct.id === c.id)?.sinContactar).length})
            </button>
            <button
              onClick={limpiarSinContactarYaContactados}
              disabled={limpiandoSinContactar}
              className="p-2 rounded-lg bg-white border text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Quitar la marca 'Sin contactar' a los que ya han sido contactados"
            >
              <RefreshCw size={14} className={limpiandoSinContactar ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clientesFiltrados.map(renderClienteCard)}
      </div>

      {showModalAnotacion && clienteParaAnotacion && (
        <ModalAnotacion contactoId={clienteParaAnotacion.id} contactoNombre={clienteParaAnotacion.nombre} onClose={() => { setShowModalAnotacion(false); setClienteParaAnotacion(null); }} />
      )}

      {/* Diálogo para elegir cuándo rellamar */}
      {rellamarDialogCliente && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm space-y-3">
            <p className="font-bold text-gray-900">¿Cuándo quieres rellamar a <span className="text-yellow-700">{rellamarDialogCliente.nombre.split(' ')[0]}</span>?</p>
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
              onClick={() => setRellamarDialogCliente(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
