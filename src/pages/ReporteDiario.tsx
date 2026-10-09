import { useState, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useSupabaseAnotaciones } from "@/hooks/useSupabaseAnotaciones";
import { useContacts } from "@/hooks/useContacts";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { Phone, MessageCircle, FileText, Calendar as CalendarIcon, Download, Printer, ExternalLink, Trash2, Pencil, Check, X, Send, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRellamar } from "@/hooks/useRellamar";
import { useReminders } from "@/hooks/useReminders";
import RellamarDialog from "@/components/RellamarDialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import LlamadasListadosDelDia from "@/components/LlamadasListadosDelDia";
import { fetchLlamadasListados, type LlamadaListado } from "@/hooks/useListadoLlamadas";
import { agruparDifusiones, coincideItem } from "@/lib/reporteDiario";
import { recordatoriosSustituidos } from "@/lib/franjaRecordatorio";

interface ReportItem {
  id: string;
  contactId: number;
  contactName: string;
  contactPhone: string;
  tipo: "llamada" | "whatsapp" | "difusion" | "nota" | "rellamar";
  hora: string;
  anotacion: string;
}

interface ReporteDiarioProps {
  onViewContact?: (id: number) => void;
}

export default function ReporteDiario({ onViewContact }: ReporteDiarioProps) {
  const { contactos, deleteContacto, updateContactoDescripcion, loading: loadingLlamadas } = useLlamadasGlobales();
  const { esRellamar, toggleRellamar } = useRellamar();
  const { addReminder, reminders, completeReminder } = useReminders();
  const [rellamarItem, setRellamarItem] = useState<{ contactId: number; nombre: string } | null>(null);
  const { anotaciones, loading: loadingAnotaciones } = useSupabaseAnotaciones();
  const { contacts, loading: loadingContacts } = useContacts();
  const { ventas } = useSupabaseVentas();
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<string>>(new Set());
  const [exportPages, setExportPages] = useState({ p1: true, p2: false, p3: false });
  const reportRef = useRef<HTMLDivElement>(null);

  // Función para exportar semana con plantilla Thermomix
  const handleExportWeekPDF = async (pages = exportPages) => {
    // Calcular inicio y fin de la semana (lunes a domingo)
    const dia = selectedDate.getDay(); // 0=dom, 1=lun...
    const diffLunes = dia === 0 ? -6 : 1 - dia;
    const lunes = new Date(selectedDate);
    lunes.setDate(selectedDate.getDate() + diffLunes);
    lunes.setHours(0, 0, 0, 0);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const fmtFecha = (d: Date) =>
      d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    const semanaLabel = `${fmtFecha(lunes)} – ${fmtFecha(domingo)}`;

    // Filtrar SOLO llamadas de la semana
    const llamadasSemana = contactos.filter(c => {
      const f = new Date(c.fecha);
      return f >= lunes && f <= domingo && c.tipo === "llamada";
    });

    // Separar contestador vs resto
    const esContestador = (txt: string) => txt.toUpperCase().includes("CONTESTADOR");
    const llamadasNormales = llamadasSemana.filter(c => !esContestador(c.descripcion));
    const totalContestador = llamadasSemana.filter(c => esContestador(c.descripcion)).length;

    // Ordenar por fecha desc
    llamadasNormales.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    // Llamadas de listados de la semana que se han marcado para el informe.
    let llamadasListados: LlamadaListado[] = [];
    try {
      llamadasListados = (await fetchLlamadasListados(lunes, domingo)).filter((l) => l.incluir_en_informe);
    } catch (err) {
      console.error("No se pudieron cargar las llamadas de listados:", err);
      toast.warning("El informe sale sin las llamadas de listados (no se pudieron cargar)");
    }
    const listadosContestador = llamadasListados.filter((l) => esContestador(l.notas ?? "")).length;
    const listadosFilas = llamadasListados
      .filter((l) => !esContestador(l.notas ?? ""))
      .map((l) => ({
        fecha: l.fecha,
        nombre: l.persona ? `${l.persona.nombre} ${l.persona.apellidos}`.trim() : "",
        telefono: l.persona?.telefono ?? "",
        notas: l.notas ?? "",
      }));

    const fmtDia = (f: string) =>
      new Date(f).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });

    const todasFilas = [
      ...llamadasNormales.map((c) => {
        const contactData = contactsMap.get(c.contactoId);
        return {
          fecha: c.fecha,
          nombre: contactData?.nombre || `Contacto ${c.contactoId}`,
          telefono: contactData?.telefono || "",
          notas: c.descripcion || "",
        };
      }),
      ...listadosFilas,
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const filas = todasFilas.map((c, i) => {
      const { nombre, telefono, notas } = c;
      const fecha = fmtDia(c.fecha);
      // Determinar si se contactó: si no contestó pero tampoco es contestador
      const noContacto = ["SIN RESPUESTA", "NO CONTESTA", "NO PUEDE ATENDER"].some(k =>
        notas.toUpperCase().includes(k)
      );
      const bgColor = i % 2 === 0 ? "#f9f9f9" : "#ffffff";
      const circuloSi = noContacto
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid #ccc;margin-right:2px"></span>Sí`
        : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2E7D32;border:1px solid #2E7D32;margin-right:2px"></span>Sí`;
      const circuloNo = noContacto
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c62828;border:1px solid #c62828;margin-right:2px"></span>No`
        : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid #ccc;margin-right:2px"></span>No`;
      return `<tr style="background:${bgColor}">
        <td style="padding:4px 6px;font-size:8pt;border-bottom:1px solid #e0e0e0">${nombre}</td>
        <td style="padding:4px 6px;font-size:8pt;border-bottom:1px solid #e0e0e0">${telefono}</td>
        <td style="padding:4px 6px;font-size:8pt;border-bottom:1px solid #e0e0e0;white-space:nowrap">${circuloSi}&nbsp;&nbsp;${circuloNo}</td>
        <td style="padding:4px 6px;font-size:8pt;border-bottom:1px solid #e0e0e0;text-align:center">${fecha}</td>
      </tr>`;
    }).join("");

    const totalContestadorConListados = totalContestador + listadosContestador;
    const totalLlamadas = todasFilas.length + totalContestadorConListados;

    // Ventas de la semana
    const ventasSemana = ventas.filter(v => {
      const f = new Date(v.fecha_venta);
      return f >= lunes && f <= domingo;
    });

    // Líneas en blanco para secciones manuales
    const lineasBlanco = (n: number) => Array(n).fill(`<div style="border-bottom:1px solid #ccc;height:18px;margin:2px 0"></div>`).join("");


    // Acciones de la semana: ventas, adopciones, reclutamientos
    const bandasHtml: string[] = [];

    // Una banda por cada venta
    ventasSemana.forEach(v => {
      bandasHtml.push(`
        <div style="margin-bottom:6px;padding:8px 14px;background:#fffbe6;border:1.5px solid #f59e0b;border-radius:5px;font-size:8.5pt;">
          <strong style="color:#b45309">ACCIÓN REALIZADA:</strong>
          <span style="margin-left:8px;color:#333">Venta de Thermomix ${v.modelo || ''} — ${new Date(v.fecha_venta).toLocaleDateString("es-ES", {day:"2-digit", month:"2-digit", year:"numeric"})}</span>
        </div>`);
    });

    // Una sola banda para TODAS las adopciones
    const idsLlamadosSemana = new Set(llamadasSemana.map(c => c.contactoId));
    const adopcionesNombres: string[] = [];
    const reclutadosNombres: string[] = [];
    idsLlamadosSemana.forEach(id => {
      const contactData = contactsMap.get(id);
      if (!contactData) return;
      const intereses: string[] = contactData.intereses || [];
      if (intereses.includes("adopcion")) adopcionesNombres.push(contactData.nombre);
      if (intereses.includes("reclutada") || intereses.includes("reclutado")) reclutadosNombres.push(contactData.nombre);
    });

    if (adopcionesNombres.length > 0) {
      bandasHtml.push(`
        <div style="margin-bottom:6px;padding:8px 14px;background:#fffbe6;border:1.5px solid #f59e0b;border-radius:5px;font-size:8.5pt;">
          <strong style="color:#b45309">ADOPCIONES:</strong>
          <span style="margin-left:8px;color:#333">${adopcionesNombres.length} cliente${adopcionesNombres.length > 1 ? "s" : ""} adoptado${adopcionesNombres.length > 1 ? "s" : ""}</span>
        </div>`);
    }

    if (reclutadosNombres.length > 0) {
      bandasHtml.push(`
        <div style="margin-bottom:6px;padding:8px 14px;background:#fffbe6;border:1.5px solid #f59e0b;border-radius:5px;font-size:8.5pt;">
          <strong style="color:#b45309">RECLUTAMIENTO:</strong>
          <span style="margin-left:8px;color:#333">${reclutadosNombres.length} persona${reclutadosNombres.length > 1 ? "s" : ""} reclutada${reclutadosNombres.length > 1 ? "s" : ""}</span>
        </div>`);
    }

    const bandaAcciones = bandasHtml.join("");

    // Construir páginas seleccionadas
    const paginaContactos = `
<!-- PÁGINA 1: Mis contactos -->
<div class="page">
<div class="p1-header">
  <div><h1>Mis contactos</h1><div style="font-size:9pt">(referencias, clientes CTL, cedidos, etc)</div></div>
  <div style="text-align:right;font-size:8pt">Semana ${semanaLabel}</div>
</div>
${bandaAcciones}
<table>
  <thead><tr class="col-header">
    <th style="width:38%">NOMBRE</th>
    <th style="width:25%">TELÉFONO</th>
    <th style="width:20%">CONTACTADO</th>
    <th style="width:17%;text-align:center">FECHA</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="contestador-box">+ ${totalContestadorConListados} llamadas realizadas a buzón / contestador (sin detalle)</div>
<div class="total-box">TOTAL LLAMADAS REALIZADAS: ${totalLlamadas}</div>
</div>`;

    const paginaAcciones = `
<!-- PÁGINA 2: Acciones clientes contactados -->
<div class="page">
<div class="p2-title"><strong>Acciones</strong> <span>clientes contactados</span></div>
<div class="acciones-grid">
  <div class="accion-box">
    <div class="accion-header-verde">VISITA PERSONALIZADA</div>
    <div class="accion-body">${lineasBlanco(12)}</div>
  </div>
  <div class="accion-box">
    <div class="accion-header-gris">CLASE O TALLER DE COCINA</div>
    <div class="accion-body-gris">${lineasBlanco(12)}</div>
  </div>
  <div class="accion-box">
    <div class="accion-header-verde">PROPUESTA DE RECLUTAMIENTO</div>
    <div class="accion-body">${lineasBlanco(12)}</div>
  </div>
  <div class="accion-box">
    <div class="accion-header-gris">DEMO</div>
    <div class="accion-body-gris">${lineasBlanco(12)}</div>
  </div>
</div>
</div>`;

    const paginaResultado = `
<!-- PÁGINA 3: Resultado y Ratios -->
<div class="page">
<div class="p3-title">Resultado</div>
<table class="resultado-table" style="margin-bottom:6px">
  <thead><tr>
    <th>CONTACTOS</th><th>LLAMADAS</th><th>VISITAS PERSONAL</th>
    <th>CLASE TALLER COCINA</th><th>PdR</th><th>DEMO</th><th>VENTAS</th><th>SEMANA</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="auto">${llamadasNormales.length}</td>
      <td class="auto">${totalLlamadas}</td>
      <td></td><td></td><td></td><td></td>
      <td class="auto">${ventasSemana.length > 0 ? ventasSemana.length : ""}</td>
      <td style="font-size:7pt;color:#888">${semanaLabel}</td>
    </tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td colspan="8" class="resultado-footer"></td></tr>
  </tbody>
</table>
${ventasSemana.length > 0 ? `
<div style="margin-top:8px;padding:6px 10px;background:#f0fff0;border:1px solid #2E7D32;border-radius:4px;font-size:8pt;">
  <strong style="color:#2E7D32">🏆 Ventas de la semana:</strong>
  ${ventasSemana.map(v => `<span style="margin-left:8px">${v.contacto_nombre} — ${v.modelo} (${new Date(v.fecha_venta).toLocaleDateString("es-ES", {day:"2-digit",month:"2-digit"})})</span>`).join("")}
</div>` : ""}
<div class="p3-title" style="margin-top:16px">Ratios</div>
<table class="ratios-table">
  <thead><tr>
    <th>CONTACTOS</th><th>LLAMADAS</th><th>VISITAS PERSONAL</th>
    <th>CLASE TALLER COCINA</th><th>PdR</th><th>DEMO</th><th>VENTAS</th>
  </tr></thead>
  <tbody>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
</div>`;

    const paginasSeleccionadas = [
      pages.p1 ? paginaContactos : null,
      pages.p2 ? paginaAcciones : null,
      pages.p3 ? paginaResultado : null,
    ].filter(Boolean).join("\n");

    if (!paginasSeleccionadas) return;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Reporte ${semanaLabel}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; font-size: 8pt; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .p1-header { background:#2E7D32; color:white; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; border-radius:4px 4px 0 0; }
  .p1-header h1 { margin:0; font-size:15pt; }
  .col-header th { background:#2E7D32; color:white; padding:5px 6px; font-size:8pt; font-weight:bold; text-align:left; }
  table { width:100%; border-collapse:collapse; }
  .contestador-box { margin-top:8px; background:#fff3e0; border:1px solid #ff9800; border-radius:4px; padding:6px 10px; color:#e65100; font-weight:bold; }
  .total-box { margin-top:6px; background:#2E7D32; color:white; border-radius:4px; padding:7px; text-align:center; font-size:10pt; font-weight:bold; }
  .p2-title { font-size:20pt; font-weight:bold; text-align:center; margin:0 0 12px 0; color:#222; }
  .p2-title span { font-weight:300; }
  .acciones-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; height:220mm; }
  .accion-box { border:1px solid #ddd; border-radius:4px; overflow:hidden; display:flex; flex-direction:column; }
  .accion-header-verde { background:#2E7D32; color:white; padding:6px 10px; font-size:8pt; font-weight:bold; text-align:center; letter-spacing:1px; }
  .accion-header-gris { background:#555; color:white; padding:6px 10px; font-size:8pt; font-weight:bold; text-align:center; letter-spacing:1px; }
  .accion-body { flex:1; padding:8px 10px; background:#fafff8; }
  .accion-body-gris { flex:1; padding:8px 10px; background:#f8f8f8; }
  .p3-title { font-size:22pt; font-weight:bold; text-align:center; color:#2E7D32; margin:0 0 8px 0; }
  .resultado-table th { background:#2E7D32; color:white; padding:6px 4px; font-size:7.5pt; font-weight:bold; text-align:center; border:1px solid #2E7D32; }
  .resultado-table td { padding:10px 4px; border:1px solid #ccc; text-align:center; font-size:9pt; }
  .resultado-table td.auto { background:#f0fff0; font-weight:bold; color:#2E7D32; }
  .resultado-footer { background:#c8e6c9; height:12px; }
  .ratios-table th { background:#2E7D32; color:white; padding:6px 4px; font-size:7.5pt; font-weight:bold; text-align:center; border:1px solid #2E7D32; }
  .ratios-table td { padding:10px 4px; border:1px solid #ccc; text-align:center; }
  @media print { button { display:none; } }
</style>
</head><body>
${paginasSeleccionadas}
<script>window.onload = () => window.print();</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  // Función para exportar a PDF
  const handleExportPDF = () => {
    const element = reportRef.current;
    if (!element) return;

    const html2pdf = (window as any).html2pdf;
    if (!html2pdf) {
      alert("Error: Librería PDF no disponible");
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const opt = {
      margin: 10,
      filename: `Reporte-Diario-${dateStr}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" },
    };

    html2pdf().set(opt).from(element).save();
  };

  // Función para imprimir
  const handlePrint = () => {
    const element = reportRef.current;
    if (!element) return;

    const printWindow = window.open("", "", "height=600,width=800");
    if (!printWindow) return;

    printWindow.document.write(element.innerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  // Crear mapa de contactos para búsqueda rápida (incluye intereses para la banda de acciones)
  const contactsMap = useMemo(() => {
    const map = new Map();
    contacts.forEach(c => {
      map.set(c.id, { nombre: c.nombre || "Sin nombre", telefono: c.telefono || "", intereses: c.intereses || [] });
    });
    return map;
  }, [contacts]);

  // Generar reporte del día seleccionado
  useEffect(() => {
    if (loadingLlamadas || loadingAnotaciones || loadingContacts) return;

    const selectedStr = selectedDate.toDateString();

    // Filtrar llamadas, WhatsApp y difusiones del día seleccionado
    const llamadasDia = contactos.filter(c => {
      const fecha = new Date(c.fecha);
      return fecha.toDateString() === selectedStr && (c.tipo === "llamada" || c.tipo === "whatsapp" || c.tipo === "difusion");
    });

    // Crear items del reporte
    const items: ReportItem[] = llamadasDia.map(llamada => {
      const contactData = contactsMap.get(llamada.contactoId);
      const contactName = contactData?.nombre || `Contacto ${llamada.contactoId}`;
      const contactPhone = contactData?.telefono || "";

      // Usar la descripción de la propia interacción (campo notas en Supabase)
      const anotacionMasReciente = llamada.descripcion || "Sin anotación";

      return {
        id: llamada.id,
        contactId: llamada.contactoId,
        contactName,
        contactPhone,
        tipo: llamada.tipo,
        hora: llamada.horaLocal,
        anotacion: anotacionMasReciente,
      };
    });

    // Ordenar por hora (más recientes primero)
    items.sort((a, b) => {
      const horaA = new Date(`2000-01-01 ${a.hora}`).getTime();
      const horaB = new Date(`2000-01-01 ${b.hora}`).getTime();
      return horaB - horaA;
    });

    setReportItems(items);
  }, [contactos, anotaciones, contacts, loadingLlamadas, loadingAnotaciones, loadingContacts, contactsMap, selectedDate]);

  const handleDeleteItem = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      await deleteContacto(id);
      setReportItems(prev => prev.filter(i => i.id !== id));
      toast.success("Registro eliminado");
    } catch {
      toast.error("Error al eliminar el registro");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleStartEdit = (item: ReportItem) => {
    setEditingId(item.id);
    setEditText(item.anotacion === "Sin anotación" ? "" : item.anotacion);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = async (id: string) => {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const nuevoTexto = editText.trim();
      await updateContactoDescripcion(id, nuevoTexto);
      setReportItems(prev =>
        prev.map(i => (i.id === id ? { ...i, anotacion: nuevoTexto || "Sin anotación" } : i))
      );
      toast.success("Comentario actualizado");
      setEditingId(null);
      setEditText("");
    } catch {
      toast.error("Error al actualizar el comentario");
    } finally {
      setSavingEdit(false);
    }
  };

  const loading = loadingLlamadas || loadingAnotaciones || loadingContacts;
  const llamadas = reportItems.filter(item => item.tipo === "llamada").length;
  const whatsapps = reportItems.filter(item => item.tipo === "whatsapp").length;
  const difusiones = reportItems.filter(item => item.tipo === "difusion").length;

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const visibles = reportItems.filter((item) => coincideItem(busqueda, item));
  const { individuales, grupos } = agruparDifusiones(visibles);

  const renderItem = (item: ReportItem) => (
              <div
                key={item.id}
                className="bg-card border border-border rounded-lg p-4 hover:bg-accent transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {/* Icono */}
                  <div className="mt-1">
                    {item.tipo === "llamada" ? (
                      <Phone className="w-5 h-5 text-blue-500" />
                    ) : item.tipo === "difusion" ? (
                      <Send className="w-5 h-5 text-indigo-500" />
                    ) : (
                      <MessageCircle className="w-5 h-5 text-green-500" />
                    )}
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <button
                          onClick={() => onViewContact?.(item.contactId)}
                          className="text-left hover:text-blue-600 transition-colors flex items-center gap-1 group-hover:underline"
                        >
                          <h3 className="font-semibold text-foreground">{item.contactName}</h3>
                          <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </button>
                        <p className="text-sm text-muted-foreground">{item.contactPhone}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.tipo === "llamada" ? "Llamada" : item.tipo === "difusion" ? "Difusión" : "WhatsApp"} • {item.hora}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={async () => {
                            if (esRellamar(item.contactId)) {
                              await toggleRellamar(item.contactId, null);
                              toast.success("Marca de rellamar eliminada");
                            } else {
                              // Preguntar día y hora: así se crea el recordatorio con aviso.
                              setRellamarItem({ contactId: item.contactId, nombre: item.contactName });
                            }
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            esRellamar(item.contactId)
                              ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-500"
                              : "text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50"
                          }`}
                          title={esRellamar(item.contactId) ? "Quitar rellamar" : "Marcar para rellamar"}
                        >
                          📞
                        </button>
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Editar comentario"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            confirmDeleteId === item.id
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "text-red-400 hover:text-red-600 hover:bg-red-50"
                          }`}
                          title="Eliminar registro"
                          onBlur={() => setConfirmDeleteId(null)}
                        >
                          <Trash2 size={14} />
                          {confirmDeleteId === item.id ? "¿Confirmar?" : ""}
                        </button>
                      </div>
                    </div>

                    {/* Anotación */}
                    {editingId === item.id ? (
                      <div className="bg-background rounded p-3 text-sm space-y-2">
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="w-full min-h-[80px] p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-background text-foreground"
                          placeholder="Escribe el comentario..."
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            disabled={savingEdit}
                            className="h-7 px-2"
                          >
                            <X size={14} className="mr-1" /> Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={savingEdit}
                            className="h-7 px-2 bg-blue-600 hover:bg-blue-700"
                          >
                            <Check size={14} className="mr-1" /> {savingEdit ? "Guardando..." : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="bg-background rounded p-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleStartEdit(item)}
                        title="Clic para editar el comentario"
                      >
                        <p className="text-foreground break-words">{item.anotacion}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto" ref={reportRef}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold">Reporte Diario</h1>
            </div>
            <div className="flex gap-2">
              <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-50"
                  >
                    <Download className="w-4 h-4" />
                    Exportar Plantilla
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4" align="end">
                  <p className="text-sm font-semibold mb-3 text-gray-700">Selecciona las páginas:</p>
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportPages.p1}
                        onChange={e => setExportPages(p => ({ ...p, p1: e.target.checked }))}
                        className="accent-green-700"
                      />
                      📋 Mis contactos <span className="text-xs text-gray-400">(semanal)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportPages.p2}
                        onChange={e => setExportPages(p => ({ ...p, p2: e.target.checked }))}
                        className="accent-green-700"
                      />
                      ✅ Acciones clientes <span className="text-xs text-gray-400">(mensual)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportPages.p3}
                        onChange={e => setExportPages(p => ({ ...p, p3: e.target.checked }))}
                        className="accent-green-700"
                      />
                      📊 Resultado y Ratios <span className="text-xs text-gray-400">(mensual)</span>
                    </label>
                  </div>
                  <Button
                    className="w-full bg-green-700 hover:bg-green-800 text-white"
                    size="sm"
                    disabled={!exportPages.p1 && !exportPages.p2 && !exportPages.p3}
                    onClick={() => { handleExportWeekPDF(exportPages); setExportMenuOpen(false); }}
                  >
                    <Printer className="w-3 h-3 mr-1" /> Generar e imprimir
                  </Button>
                </PopoverContent>
              </Popover>
              <Button
                onClick={handleExportPDF}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                PDF
              </Button>
              <Button
                onClick={handlePrint}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[280px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
                Hoy
              </Button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Contactos</p>
                <p className="text-2xl font-bold">{reportItems.length}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Llamadas</p>
                <p className="text-2xl font-bold">{llamadas}</p>
              </div>
              <Phone className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">WhatsApp</p>
                <p className="text-2xl font-bold">{whatsapps}</p>
              </div>
              <MessageCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Difusión</p>
                <p className="text-2xl font-bold">{difusiones}</p>
              </div>
              <Send className="w-8 h-8 text-indigo-500" />
            </div>
          </div>
        </div>

        {/* Lista de contactos */}
        {reportItems.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              No hay llamadas, WhatsApp ni difusiones registradas {isToday ? "hoy" : `el ${format(selectedDate, "d 'de' MMMM", { locale: es })}`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el reporte (nombre, teléfono o comentario)..."
                aria-label="Buscar en el reporte"
                className="w-full pl-9 pr-9 py-2 border border-border rounded-lg text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-blue-500"
              />
              {busqueda && (
                <button onClick={() => setBusqueda("")} className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground" title="Borrar búsqueda">
                  <X size={16} />
                </button>
              )}
            </div>
            {individuales.map(renderItem)}
            {grupos.map((g) => {
              const abierto = !!busqueda.trim() || gruposAbiertos.has(g.texto);
              return (
                <div key={g.texto} className="bg-card border border-indigo-200 rounded-lg">
                  <button
                    onClick={() => setGruposAbiertos((prev) => {
                      const n = new Set(prev);
                      if (n.has(g.texto)) n.delete(g.texto); else n.add(g.texto);
                      return n;
                    })}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent rounded-lg transition-colors"
                  >
                    <Send className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">📣 Difusión a {g.items.length} {g.items.length === 1 ? "persona" : "personas"}</p>
                      <p className="text-sm text-muted-foreground break-words">{g.texto}</p>
                    </div>
                    <span className="text-sm text-indigo-600 flex-shrink-0">{abierto ? "▲ Ocultar" : "▼ Ver lista"}</span>
                  </button>
                  {abierto && <div className="space-y-3 p-3 pt-0">{g.items.map(renderItem)}</div>}
                </div>
              );
            })}
            {busqueda.trim() && individuales.length === 0 && grupos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No hay nadie con "{busqueda}" en este día.</p>
            )}
          </div>
        )}

        {/* Llamadas hechas desde Listados: se elige cuáles entran en el informe */}
        <LlamadasListadosDelDia dia={selectedDate} />
      </div>

      {rellamarItem && (
        <RellamarDialog
          nombre={rellamarItem.nombre}
          onClose={() => setRellamarItem(null)}
          onConfirmar={async (fecha, hora, nota) => {
            try {
              // Los recordatorios suyos que ya tocaban quedan sustituidos por este:
              // se cierran para que no se queden en "Vencidos".
              const viejos = recordatoriosSustituidos(reminders, rellamarItem.contactId);
              for (const r of viejos) await completeReminder(r.id, r.frequency);
              // Solo el recordatorio (avisa al móvil y sale en Recordatorios). Si
              // además se marcara "rellamar" con fecha, saldría duplicado allí.
              await addReminder(
                rellamarItem.contactId,
                rellamarItem.nombre,
                7,
                "general",
                `${fecha}T${hora}:00`,
                nota ? `Rellamar: ${nota}` : "Rellamar"
              );
              const dia = new Date(`${fecha}T${hora}:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
              toast.success(`📞 Recordatorio creado: ${dia} a las ${hora}`
                + (viejos.length ? ` (cerrado${viejos.length > 1 ? "s" : ""} ${viejos.length} pendiente${viejos.length > 1 ? "s" : ""} anterior${viejos.length > 1 ? "es" : ""})` : ""));
            } catch (err) {
              console.error(err);
              toast.error("No se pudo crear el recordatorio");
              throw err;
            }
          }}
        />
      )}

      {/* Script para html2pdf */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    </div>
  );
}
