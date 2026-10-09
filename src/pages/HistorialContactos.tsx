import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Phone, MessageCircle, Send, Trash2, Calendar, FileText, Search, Users } from "lucide-react";
import { useContacts } from "@/hooks/useContacts";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { toast } from "sonner";
import { coincideBusqueda } from "@/lib/listados";

export default function HistorialContactos() {
  const { contacts, loading: loadingContacts } = useContacts();
  const { contactos, getContactosPorContacto, deleteContacto, reloadFromStorage, loading: loadingLlamadas } = useLlamadasGlobales();
  const loading = loadingContacts || loadingLlamadas;
  const [selectedContactoId, setSelectedContactoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "llamada" | "whatsapp" | "difusion" | "nota">("todos");
  const [selectedMes, setSelectedMes] = useState<string>(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    reloadFromStorage();
    // Forzar recarga de datos cuando se abre el Historial
    const timer = setTimeout(() => {
      reloadFromStorage();
    }, 500);
    return () => clearTimeout(timer);
  }, [reloadFromStorage]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => coincideBusqueda(searchTerm, contact.nombre, contact.telefono));
  }, [contacts, searchTerm]);

  const contactosDelCliente = useMemo(() => {
    if (!selectedContactoId) return [];
    
    let resultado = getContactosPorContacto(selectedContactoId);
    
    if (filtroTipo !== "todos") {
      resultado = resultado.filter((c) => c.tipo === filtroTipo);
    }
    
    const [year, month] = selectedMes.split("-");
    resultado = resultado.filter((c) => {
      const cDate = new Date(c.fecha);
      return (
        cDate.getFullYear() === parseInt(year) &&
        cDate.getMonth() === parseInt(month) - 1
      );
    });
    
    return resultado;
  }, [selectedContactoId, contactos, filtroTipo, selectedMes, getContactosPorContacto]);

  const contactosAgrupados = useMemo(() => {
    const grupos: { [key: string]: typeof contactosDelCliente } = {};
    
    contactosDelCliente.forEach((c) => {
      if (!grupos[c.fechaLocal]) {
        grupos[c.fechaLocal] = [];
      }
      grupos[c.fechaLocal].push(c);
    });
    
    return Object.entries(grupos).sort(([dateA], [dateB]) => {
      const [dA, mA, yA] = dateA.split("/");
      const [dB, mB, yB] = dateB.split("/");
      return new Date(`${yB}-${mB}-${dB}`).getTime() - new Date(`${yA}-${mA}-${dA}`).getTime();
    });
  }, [contactosDelCliente]);

  const estadisticas = useMemo(() => {
    if (!selectedContactoId) return { llamadas: 0, whatsapp: 0, notas: 0, total: 0 };
    
    const todos = getContactosPorContacto(selectedContactoId);
    return {
      llamadas: todos.filter((c) => c.tipo === "llamada").length,
      whatsapp: todos.filter((c) => c.tipo === "whatsapp").length,
      notas: todos.filter((c) => c.tipo === "nota").length,
      total: todos.length,
    };
  }, [selectedContactoId, contactos, getContactosPorContacto]);

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "llamada": return <Phone size={16} className="text-green-600" />;
      case "whatsapp": return <MessageCircle size={16} className="text-green-500" />;
      case "difusion": return <Send size={16} className="text-blue-600" />;
      case "nota": return <FileText size={16} className="text-blue-500" />;
      default: return null;
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "llamada": return "Llamada";
      case "whatsapp": return "WhatsApp";
      case "difusion": return "Difusión";
      case "nota": return "Nota";
      default: return tipo;
    }
  };

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case "llamada": return "bg-green-100 text-green-700";
      case "whatsapp": return "bg-green-50 text-green-600";
      case "difusion": return "bg-blue-100 text-blue-700";
      case "nota": return "bg-blue-50 text-blue-600";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando historial de contactos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Historial de Contactos</h1>
        <p className="text-muted-foreground mt-1">Consulta todas las interacciones registradas con tus clientes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selector de Cliente */}
        <Card className="lg:col-span-4 p-4 h-fit">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelectedContactoId(contact.id)}
                className={`w-full text-left p-3 rounded-lg transition-all border ${
                  selectedContactoId === contact.id
                    ? "bg-green-600 text-white border-green-600 shadow-sm"
                    : "bg-white hover:bg-gray-50 border-gray-100"
                }`}
              >
                <p className="font-bold text-sm">{contact.nombre}</p>
                <p className={`text-xs ${selectedContactoId === contact.id ? "text-green-100" : "text-gray-500"}`}>{contact.ubicacion}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Historial Detallado */}
        <div className="lg:col-span-8 space-y-4">
          {selectedContactoId ? (
            <>
              {/* Estadísticas Rápidas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3 text-center bg-green-50 border-green-100">
                  <p className="text-xl font-bold text-green-700">{estadisticas.llamadas}</p>
                  <p className="text-[10px] uppercase font-bold text-green-600">Llamadas</p>
                </Card>
                <Card className="p-3 text-center bg-emerald-50 border-emerald-100">
                  <p className="text-xl font-bold text-emerald-700">{estadisticas.whatsapp}</p>
                  <p className="text-[10px] uppercase font-bold text-emerald-600">WhatsApp</p>
                </Card>
                <Card className="p-3 text-center bg-blue-50 border-blue-100">
                  <p className="text-xl font-bold text-blue-700">{estadisticas.notas}</p>
                  <p className="text-[10px] uppercase font-bold text-blue-600">Notas</p>
                </Card>
                <Card className="p-3 text-center bg-gray-50 border-gray-200">
                  <p className="text-xl font-bold text-gray-700">{estadisticas.total}</p>
                  <p className="text-[10px] uppercase font-bold text-gray-500">Total</p>
                </Card>
              </div>

              {/* Filtros de Historial */}
              <Card className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {["todos", "llamada", "whatsapp", "nota"].map((tipo) => (
                    <button
                      key={tipo}
                      onClick={() => setFiltroTipo(tipo as any)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        filtroTipo === tipo ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {tipo === "todos" ? "Todos" : getTipoLabel(tipo)}
                    </button>
                  ))}
                </div>
                <input
                  type="month"
                  value={selectedMes}
                  onChange={(e) => setSelectedMes(e.target.value)}
                  className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </Card>

              {/* Lista de Interacciones */}
              <div className="space-y-6">
                {contactosAgrupados.length > 0 ? (
                  contactosAgrupados.map(([fecha, items]) => (
                    <div key={fecha} className="relative pl-4 border-l-2 border-gray-200 ml-2">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white border-2 border-gray-300 rounded-full" />
                      <h4 className="font-bold text-sm text-gray-500 mb-3 uppercase tracking-wider">{fecha}</h4>
                      <div className="space-y-3">
                        {items.map((item) => (
                          <Card key={item.id} className="p-4 hover:shadow-sm transition-shadow">
                            <div className="flex justify-between items-start">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  {getTipoIcon(item.tipo)}
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getTipoBadgeColor(item.tipo)}`}>
                                    {getTipoLabel(item.tipo)}
                                  </span>
                                  <span className="text-xs text-gray-400 font-medium">{item.horaLocal}</span>
                                </div>
                                <p className="text-sm text-gray-800 leading-relaxed">{item.descripcion}</p>
                              </div>
                              <button
                                onClick={() => {
                                  if(confirm("¿Estás seguro de eliminar este registro?")) {
                                    deleteContacto(item.id);
                                    toast.success("Registro eliminado");
                                  }
                                }}
                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <Card className="p-12 text-center bg-gray-50 border-dashed">
                    <Calendar className="mx-auto text-gray-300 mb-3" size={40} />
                    <p className="text-gray-500">No hay interacciones registradas en este periodo.</p>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <Card className="p-20 text-center bg-gray-50 border-dashed">
              <Users className="mx-auto text-gray-300 mb-4" size={64} />
              <h3 className="text-xl font-bold text-gray-400">Selecciona un cliente</h3>
              <p className="text-gray-400">Elige un cliente de la lista de la izquierda para ver su historial completo.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
