import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Phone, MessageCircle, Search, ChevronLeft, ChevronRight, Send, X, CheckSquare, Square, ClipboardPaste, Megaphone, Users } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { ETAPAS_EMBUDO } from "@/lib/embudo";
import { useContacts } from "@/hooks/useContacts";
import { useInteractions } from "@/hooks/useInteractions";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useRellamar } from "@/hooks/useRellamar";
import ContactDialog from "@/components/ContactDialog";
import DifusionListasDialog from "@/components/DifusionListasDialog";
import { esArchivado, esSoloSiNecesita, noProponerLlamar } from "@/lib/marcas";
import { Contact } from "@/data/contacts";
import { toast } from "sonner";
import { confirmarLlamada } from "@/lib/callDialog";

interface ContactosNewProps {
  onViewContact?: (contactId: number) => void;
}

export default function Contactos({
  onViewContact,
}: ContactosNewProps = {}) {
  const { contacts, loading, addContact, updateContact, deleteContact, marcarRecibeDifusion } = useContacts();
  const { addContacto, getContactosPorContacto } = useLlamadasGlobales();
  const { esRellamar } = useRellamar();
  const { recordInteraction } = useInteractions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterModelo, setFilterModelo] = useState<string>("");
  const [filterInteres, setFilterInteres] = useState<string>("");
  const [filterSinContactar, setFilterSinContactar] = useState<string>("");
  const [filterOrigen, setFilterOrigen] = useState<string>("");
  const [filterEstadoLead, setFilterEstadoLead] = useState<string>("");
  const [filterDifusion, setFilterDifusion] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showArchivados, setShowArchivados] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDifusionModal, setShowDifusionModal] = useState(false);
  const [difusionTexto, setDifusionTexto] = useState("");
  const [difusionFecha, setDifusionFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [savingDifusion, setSavingDifusion] = useState(false);
  const [showPasteSelect, setShowPasteSelect] = useState(false);
  const [showListasDifusion, setShowListasDifusion] = useState(false);
  const [pasteTexto, setPasteTexto] = useState("");

  const ORIGENES = ["Referido", "Vinted", "Wallapop", "Facebook", "Milanuncios", "Clase/Taller", "Listado", "Otro"];
  // Los pasos del embudo (lib/embudo.ts) también se pueden filtrar aquí.
  const ESTADOS_LEAD = ["Nuevo", "Contactado", ...ETAPAS_EMBUDO.map((e) => e.id), "Descartado"];

  const CONTACTS_PER_PAGE = 25;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterModelo, filterInteres, filterSinContactar, filterOrigen, filterEstadoLead, filterDifusion]);

  const contactosActivos = useMemo(() => contacts.filter(c => !noProponerLlamar(c.nombre)), [contacts]);
  const contactosArchivados = useMemo(() => contacts.filter(c => esArchivado(c.nombre)), [contacts]);
  const contactosSoloSiNecesita = useMemo(() => contacts.filter(c => esSoloSiNecesita(c.nombre)), [contacts]);
  const [showSoloSiNecesita, setShowSoloSiNecesita] = useState(false);

  // Al buscar, avisa si la persona está en ⛔ Archivados (no hay que llamarla)
  // o en 🤝 "Solo si me necesita" (no invitar ni llamar).
  const encontrarEn = (lista: typeof contacts) => {
    const texto = searchTerm.trim();
    if (texto.length < 2) return [];
    const normalize = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const term = normalize(texto);
    const digitos = texto.replace(/\D/g, "");
    return lista.filter((c) =>
      normalize(c.nombre).includes(term) ||
      (digitos.length >= 4 && c.telefono.replace(/\D/g, "").includes(digitos))
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const archivadosEncontrados = useMemo(() => encontrarEn(contactosArchivados), [contactosArchivados, searchTerm]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const soloSiNecesitaEncontrados = useMemo(() => encontrarEn(contactosSoloSiNecesita), [contactosSoloSiNecesita, searchTerm]);

  const filteredContacts = useMemo(() => {
    return contactosActivos.filter((contact) => {
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const term = normalize(searchTerm);
      const matchesSearch =
        normalize(contact.nombre).includes(term) ||
        contact.telefono.includes(searchTerm) ||
        normalize(contact.ubicacion).includes(term);

      const matchesModelo = !filterModelo || (contact.modelo && contact.modelo === filterModelo);
      
      let matchesInteres = true;
      if (filterInteres === "MI ZONA") {
        matchesInteres = contact.zonaPlaya === true;
      } else if (filterInteres) {
        matchesInteres = contact.intereses && contact.intereses.includes(filterInteres);
      }
      
      let matchesSinContactar = true;
      if (filterSinContactar === "nunca_intentado") {
        // Sin ninguna interacción registrada Y sin notas en el campo del contacto
        const interacciones = getContactosPorContacto(contact.id);
        matchesSinContactar = interacciones.length === 0 && !contact.notas?.trim();
      } else if (filterSinContactar === "solo_contestador") {
        // Marcado para rellamar Y la última interacción menciona "CONTESTADOR"
        if (!esRellamar(contact.id)) {
          matchesSinContactar = false;
        } else {
          const interacciones = getContactosPorContacto(contact.id);
          const ultima = interacciones[0];
          matchesSinContactar = ultima
            ? ultima.descripcion.toUpperCase().includes("CONTESTADOR")
            : false;
        }
      } else if (filterSinContactar === "pide_rellamar") {
        // Marcado para rellamar Y la última interacción NO menciona "CONTESTADOR"
        if (!esRellamar(contact.id)) {
          matchesSinContactar = false;
        } else {
          const interacciones = getContactosPorContacto(contact.id);
          const ultima = interacciones[0];
          matchesSinContactar = ultima
            ? !ultima.descripcion.toUpperCase().includes("CONTESTADOR")
            : true;
        }
      }

      const matchesOrigen = !filterOrigen || contact.origen === filterOrigen;
      const matchesEstadoLead = !filterEstadoLead || contact.estado_lead === filterEstadoLead;

      let matchesDifusion = true;
      if (filterDifusion === "recibio") {
        matchesDifusion = getContactosPorContacto(contact.id).some((i) => i.tipo === "difusion");
      } else if (filterDifusion === "nunca") {
        matchesDifusion = !getContactosPorContacto(contact.id).some((i) => i.tipo === "difusion");
      } else if (filterDifusion === "guardada") {
        matchesDifusion = !!contact.recibeDifusion;
      } else if (filterDifusion === "no_guardada") {
        matchesDifusion = !contact.recibeDifusion;
      }

      return matchesSearch && matchesModelo && matchesInteres && matchesSinContactar && matchesOrigen && matchesEstadoLead && matchesDifusion;
    });
  }, [contactosActivos, searchTerm, filterModelo, filterInteres, filterSinContactar, filterOrigen, filterEstadoLead, filterDifusion, esRellamar, getContactosPorContacto]);

  const totalPages = Math.ceil(filteredContacts.length / CONTACTS_PER_PAGE);
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * CONTACTS_PER_PAGE,
    currentPage * CONTACTS_PER_PAGE
  );

  // Reset page when filters change
  const handleFilterChange = (setter: any, value: any) => {
    setCurrentPage(1);
    setter(value);
  };

  const handleAddContact = async (data: Omit<Contact, "id">) => {
    try {
      await addContact(data);
      toast.success("Contacto añadido correctamente");
      setSelectedContact(undefined);
    } catch (error) {
      toast.error("Error al añadir contacto");
    }
  };

  const handleUpdateContact = async (data: Omit<Contact, "id">) => {
    if (!selectedContact) return;
    try {
      await updateContact({ ...data, id: selectedContact.id });
      toast.success("Contacto actualizado correctamente");
      setSelectedContact(undefined);
    } catch (error) {
      toast.error("Error al actualizar contacto");
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este contacto?")) {
      try {
        await deleteContact(id);
        toast.success("Contacto eliminado correctamente");
      } catch (error) {
        toast.error("Error al eliminar contacto");
      }
    }
  };

  const handleCall = async (contact: Contact) => {
    const metodo = await confirmarLlamada(contact.telefono);
    if (metodo === "cancelado") return;
    await recordInteraction(contact.id, "llamada", `Llamada a ${contact.nombre}`);
    addContacto(contact.id, "llamada", `Llamada realizada a ${contact.nombre}`);
    await updateContact({ ...contact, ultimoContacto: new Date().toISOString(), sinContactar: false });
    toast.success("Interacción registrada");
  };

  const handleWhatsApp = async (contact: Contact) => {
    const phone = contact.telefono.replace(/\D/g, "");
    const nombre = contact.nombre.split(' ')[0];
    // Mirando la lista de "no me tienen guardada", el mensaje pide que guarden el número.
    const message = filterDifusion === "no_guardada" && !contact.recibeDifusion
      ? `¡Hola ${nombre}! Soy tu asesora Thermomix 😊 Guárdame en tus contactos para recibir las invitaciones a clases y novedades. ¡Gracias!`
      : `¡Hola ${nombre}! Te contacto desde Thermomix. ¿Cómo estás?`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    await recordInteraction(contact.id, "whatsapp", `WhatsApp a ${contact.nombre}`);
    addContacto(contact.id, "whatsapp", `WhatsApp enviado a ${contact.nombre}`);
    await updateContact({ ...contact, ultimoContacto: new Date().toISOString(), sinContactar: false });
    toast.success("Interacción registrada");
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todosVisiblesSeleccionados = paginatedContacts.length > 0 && paginatedContacts.every((c) => selectedIds.has(c.id));

  const toggleSeleccionarVisibles = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (todosVisiblesSeleccionados) {
        paginatedContacts.forEach((c) => next.delete(c.id));
      } else {
        paginatedContacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const seleccionarTodosFiltrados = () => {
    setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
  };

  const limpiarSeleccion = () => setSelectedIds(new Set());

  // Selección masiva a partir de una lista de nombres o teléfonos pegada
  // (p.ej. copiada de una lista de difusión de WhatsApp Business). Busca
  // cada línea contra TODOS los contactos activos, sin importar los filtros
  // aplicados en pantalla, y añade las coincidencias a la selección actual.
  const handlePasteSelect = () => {
    const normalize = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

    const lineas = pasteTexto
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lineas.length === 0) {
      toast.error("Pega al menos un nombre o teléfono");
      return;
    }

    const nuevaSeleccion = new Set(selectedIds);
    const noEncontrados: string[] = [];
    const conVariasCoincidencias: string[] = [];
    let añadidos = 0;

    lineas.forEach((linea) => {
      const digitos = linea.replace(/\D/g, "");
      let coincidencias: Contact[] = [];

      if (digitos.length >= 6) {
        coincidencias = contactosActivos.filter((c) => c.telefono.replace(/\D/g, "").includes(digitos));
      }
      if (coincidencias.length === 0) {
        const term = normalize(linea);
        if (term) {
          coincidencias = contactosActivos.filter((c) => normalize(c.nombre).includes(term));
        }
      }

      if (coincidencias.length === 0) {
        noEncontrados.push(linea);
      } else {
        if (coincidencias.length > 1) conVariasCoincidencias.push(linea);
        coincidencias.forEach((c) => {
          if (!nuevaSeleccion.has(c.id)) añadidos++;
          nuevaSeleccion.add(c.id);
        });
      }
    });

    setSelectedIds(nuevaSeleccion);

    if (añadidos > 0) {
      toast.success(`${añadidos} contacto${añadidos !== 1 ? "s" : ""} añadido${añadidos !== 1 ? "s" : ""} a la selección`);
    }
    if (conVariasCoincidencias.length > 0) {
      toast.warning(`Varias coincidencias para: ${conVariasCoincidencias.join(", ")} (se añadieron todas, revisa la lista)`);
    }
    if (noEncontrados.length > 0) {
      toast.error(`No se encontraron: ${noEncontrados.join(", ")}`);
    }

    setPasteTexto("");
    setShowPasteSelect(false);
  };

  const handleRegistrarDifusion = async () => {
    if (!difusionTexto.trim()) {
      toast.error("Escribe el mensaje o motivo de la difusión");
      return;
    }
    if (selectedIds.size === 0) return;

    setSavingDifusion(true);
    try {
      const fecha = new Date(difusionFecha + "T12:00:00");
      const idsSeleccionados = Array.from(selectedIds);
      await Promise.all(
        idsSeleccionados.map((id) => addContacto(id, "difusion", difusionTexto.trim(), fecha))
      );
      toast.success(`Difusión registrada para ${idsSeleccionados.length} contacto${idsSeleccionados.length !== 1 ? "s" : ""}`);
      setShowDifusionModal(false);
      setDifusionTexto("");
      limpiarSeleccion();
    } catch (error) {
      toast.error("Error al registrar la difusión");
    } finally {
      setSavingDifusion(false);
    }
  };

  const handleMarcarGuardada = async (valor: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await marcarRecibeDifusion(ids, valor);
      toast.success(
        valor
          ? `${ids.length} marcada${ids.length !== 1 ? "s" : ""} como "me tiene guardada"`
          : `Quitada la marca a ${ids.length} contacto${ids.length !== 1 ? "s" : ""}`
      );
      limpiarSeleccion();
    } catch {
      toast.error("No se pudo guardar la marca");
    }
  };

  const registrarDifusionLista = async (ids: number[], texto: string, fechaISO: string) => {
    try {
      const fecha = new Date(fechaISO + "T12:00:00");
      await Promise.all(ids.map((id) => addContacto(id, "difusion", texto, fecha)));
      toast.success(`Difusión registrada para ${ids.length} contacto${ids.length !== 1 ? "s" : ""}`);
    } catch (error) {
      toast.error("Error al registrar la difusión");
      throw error;
    }
  };

  const openDialog = (contact?: Contact) => {
    setSelectedContact(contact);
    setDialogOpen(true);
  };

  const modelos = Array.from(new Set(contacts.map((c) => c.modelo))).filter(m => m && m.trim() !== "");
  
  const interesesFromData = Array.from(
    new Set(contacts.flatMap((c) => c.intereses))
  ).filter(i => i && !["SIN CONTACTAR", "TM7"].includes(i));
  const intereses = [...interesesFromData, "MI ZONA"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando contactos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <CabeceraFormacion
          icono={Users}
          titulo="Contactos"
          subtitulo={`${filteredContacts.length} de ${contactosActivos.length} contactos`}
        />
        <Button
          onClick={() => openDialog()}
          className="w-full md:w-auto bg-primary hover:bg-primary/90 gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Contacto
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, teléfono o ubicación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {archivadosEncontrados.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900" role="alert">
              <p className="font-semibold">
                ⛔ {archivadosEncontrados.length === 1 ? "Esta persona está" : `${archivadosEncontrados.length} personas están`} en Archivados (no llamar)
              </p>
              <ul className="mt-1 space-y-1">
                {archivadosEncontrados.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.nombre} · {c.telefono}</span>
                    <button onClick={() => onViewContact?.(c.id)} className="underline shrink-0">Ver ficha</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soloSiNecesitaEncontrados.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900" role="status">
              <p className="font-semibold">
                🤝 {soloSiNecesitaEncontrados.length === 1 ? "Esta persona está" : `${soloSiNecesitaEncontrados.length} personas están`} en "Solo si me necesita": no invitar ni llamar
              </p>
              <ul className="mt-1 space-y-1">
                {soloSiNecesitaEncontrados.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.nombre} · {c.telefono}</span>
                    <button onClick={() => onViewContact?.(c.id)} className="underline shrink-0">Ver ficha</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={filterModelo}
              onChange={(e) => setFilterModelo(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos los modelos</option>
              {modelos.map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>

            <select
              value={filterInteres}
              onChange={(e) => setFilterInteres(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos los intereses</option>
              {intereses.map((interes) => (
                <option key={interes} value={interes}>
                  {interes}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={filterSinContactar}
              onChange={(e) => setFilterSinContactar(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos los pendientes</option>
              <option value="nunca_intentado">⚪ Nunca intentado</option>
              <option value="solo_contestador">🔴 Solo contestador</option>
              <option value="pide_rellamar">🟡 Piden rellamar</option>
            </select>

            <select
              value={filterDifusion}
              onChange={(e) => setFilterDifusion(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos (difusión)</option>
              <option value="recibio">📨 Ya recibió difusión</option>
              <option value="nunca">⚪ Nunca recibió difusión</option>
              <option value="guardada">📣 Me tienen guardada</option>
              <option value="no_guardada">🚫 No me tienen guardada</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={filterOrigen}
              onChange={(e) => setFilterOrigen(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos los orígenes</option>
              {ORIGENES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            <select
              value={filterEstadoLead}
              onChange={(e) => setFilterEstadoLead(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_LEAD.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Barra de selección múltiple / difusión masiva */}
      <Card className="p-4 space-y-3 bg-gray-50 border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleSeleccionarVisibles}
              className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
              title="Seleccionar/deseleccionar los contactos visibles en esta página"
            >
              {todosVisiblesSeleccionados ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              Seleccionar página
            </button>
            {filteredContacts.length > paginatedContacts.length && (
              <button
                onClick={seleccionarTodosFiltrados}
                className="text-sm text-blue-700 hover:text-blue-900 underline"
              >
                Seleccionar los {filteredContacts.length} filtrados
              </button>
            )}
            <button
              onClick={() => setShowPasteSelect((v) => !v)}
              className="flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 underline"
              title="Pegar una lista de nombres o teléfonos (p.ej. copiada de WhatsApp) para seleccionarlos automáticamente"
            >
              <ClipboardPaste className="w-4 h-4" />
              Pegar lista
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-blue-900 font-semibold">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}</span>
                <button onClick={limpiarSeleccion} className="text-sm text-blue-700 hover:text-blue-900 underline">
                  Limpiar
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setShowListasDifusion(true)}
              className="gap-2"
              title="Registrar una difusión (clase online o presencial), quitando a quien no toque"
            >
              <Megaphone className="w-4 h-4" />
              Nueva difusión
            </Button>
            <Button
              onClick={() => setShowDifusionModal(true)}
              disabled={selectedIds.size === 0}
              variant="outline"
              className="gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Registrar difusión ({selectedIds.size})
            </Button>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-blue-900">Con las {selectedIds.size} seleccionadas:</span>
            <Button size="sm" variant="outline" onClick={() => handleMarcarGuardada(true)} className="gap-1">
              📣 Marcar "me tiene guardada"
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleMarcarGuardada(false)}>
              Quitar la marca
            </Button>
          </div>
        )}

        {showPasteSelect && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
            <label className="text-xs font-medium text-blue-900 block">
              Pega aquí una lista de nombres o teléfonos (uno por línea, o separados por comas). Por ejemplo, copiados de una lista de difusión de WhatsApp.
            </label>
            <textarea
              value={pasteTexto}
              onChange={(e) => setPasteTexto(e.target.value)}
              placeholder={"Ana García\nMaria López\n612345678\n..."}
              className="w-full p-2 border border-input rounded-md text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-background"
            />
            <div className="flex gap-2">
              <Button onClick={handlePasteSelect} size="sm">
                Buscar y añadir a la selección
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowPasteSelect(false); setPasteTexto(""); }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Table - Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={todosVisiblesSeleccionados}
                    onChange={toggleSeleccionarVisibles}
                    className="w-4 h-4"
                    title="Seleccionar todos los visibles"
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Intereses</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedContacts.map((contact) => (
                <TableRow key={contact.id} className={selectedIds.has(contact.id) ? "bg-green-50/60" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="w-4 h-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {contact.nombre}
                    {contact.recibeDifusion && <span className="ml-1" title="Me tiene guardada: le llegan las difusiones">📣</span>}
                  </TableCell>
                  <TableCell>{contact.telefono}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-medium rounded">
                      {contact.modelo}
                    </span>
                  </TableCell>
                  <TableCell>{contact.ubicacion}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.intereses.slice(0, 2).map((interes) => (
                        <span
                          key={interes}
                          className="px-2 py-1 bg-accent/20 text-accent text-xs rounded"
                        >
                          {interes}
                        </span>
                      ))}
                      {contact.intereses.length > 2 && (
                        <span className="text-xs text-muted-foreground">
                          +{contact.intereses.length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleCall(contact)}
                        className="p-2 hover:bg-primary/10 rounded transition"
                        title="Llamar"
                      >
                        <Phone className="w-4 h-4 text-primary" />
                      </button>
                      <button
                        onClick={() => handleWhatsApp(contact)}
                        className="p-2 hover:bg-green-100 rounded transition"
                        title="WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={() => onViewContact?.(contact.id)}
                        className="p-2 hover:bg-blue-100 rounded transition"
                        title="Ver detalles y anotaciones"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-2 hover:bg-red-100 rounded transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Cards - Mobile */}
      <div className="md:hidden space-y-3">
        {paginatedContacts.map((contact) => (
          <Card key={contact.id} className={`p-4 ${selectedIds.has(contact.id) ? "bg-green-50/60 border-green-300" : ""}`}>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(contact.id)}
                  onChange={() => toggleSelect(contact.id)}
                  className="w-4 h-4 mt-1"
                />
                <div>
                  <h3 className="font-bold text-foreground">
                    {contact.nombre}
                    {contact.recibeDifusion && <span className="ml-1" title="Me tiene guardada: le llegan las difusiones">📣</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground">{contact.telefono}</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-medium rounded">
                  {contact.modelo}
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {contact.ubicacion}
                </span>
              </div>

              {contact.intereses.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {contact.intereses.map((interes) => (
                    <span
                      key={interes}
                      className="px-2 py-1 bg-accent/20 text-accent text-xs rounded"
                    >
                      {interes}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleCall(contact)}
                  className="flex-1 p-2 bg-primary/10 hover:bg-primary/20 rounded transition flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">Llamar</span>
                </button>
                <button
                  onClick={() => handleWhatsApp(contact)}
                  className="flex-1 p-2 bg-green-100 hover:bg-green-200 rounded transition flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-sm">WhatsApp</span>
                </button>
                <button
                  onClick={() => onViewContact?.(contact.id)}
                  className="flex-1 p-2 bg-green-50 hover:bg-green-100 rounded transition"
                  title="Ver detalles y anotaciones"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteContact(contact.id)}
                  className="flex-1 p-2 bg-gray-100 hover:bg-red-100 rounded transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination Controls */}
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
            <span className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
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

      {filteredContacts.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No se encontraron contactos</p>
        </Card>
      )}

      {/* Sección "Solo si me necesita" 🤝 / 🔇 */}
      {contactosSoloSiNecesita.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowSoloSiNecesita(!showSoloSiNecesita)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 font-medium"
          >
            <span>🤝 Solo si me necesita ({contactosSoloSiNecesita.length})</span>
            <span className="text-sm">{showSoloSiNecesita ? "▲ Ocultar" : "▼ Mostrar"}</span>
          </button>
          {showSoloSiNecesita && (
            <Card className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Ficha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactosSoloSiNecesita.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.nombre}</TableCell>
                      <TableCell>{contact.telefono}</TableCell>
                      <TableCell>{contact.ubicacion}</TableCell>
                      <TableCell className="text-right">
                        <button onClick={() => onViewContact?.(contact.id)} className="p-2 hover:bg-blue-100 rounded transition" title="Ver ficha">
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Sección Archivados ⛔ */}
      {contactosArchivados.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchivados(!showArchivados)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600 font-medium"
          >
            <span>⛔ Archivados ({contactosArchivados.length})</span>
            <span className="text-sm">{showArchivados ? "▲ Ocultar" : "▼ Mostrar"}</span>
          </button>
          {showArchivados && (
            <Card className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactosArchivados.map((contact) => (
                    <TableRow key={contact.id} className="opacity-60">
                      <TableCell className="font-medium">{contact.nombre}</TableCell>
                      <TableCell>{contact.telefono}</TableCell>
                      <TableCell>{contact.ubicacion}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onViewContact?.(contact.id)}
                            className="p-2 hover:bg-blue-100 rounded transition"
                            title="Ver ficha"
                          >
                            <Edit className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            className="p-2 hover:bg-red-100 rounded transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={selectedContact}
        onSave={selectedContact ? handleUpdateContact : handleAddContact}
      />

      {showListasDifusion && (
        <DifusionListasDialog
          contactos={contactosActivos}
          onClose={() => setShowListasDifusion(false)}
          onRegistrar={registrarDifusionLista}
        />
      )}

      {/* Modal de difusión masiva */}
      {showDifusionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" /> Registrar difusión
              </h2>
              <button onClick={() => setShowDifusionModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Se registrará esta interacción para los <strong>{selectedIds.size}</strong> contacto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""} de una sola vez.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium block">Mensaje / motivo</label>
              <textarea
                value={difusionTexto}
                onChange={(e) => setDifusionTexto(e.target.value)}
                placeholder="Ej: Invitación a la clase por Zoom del miércoles 23/09"
                className="w-full p-3 border border-input rounded-md text-sm min-h-[90px] outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium block">Fecha</label>
              <Input
                type="date"
                value={difusionFecha}
                onChange={(e) => setDifusionFecha(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleRegistrarDifusion}
                disabled={savingDifusion}
                className="flex-1"
              >
                {savingDifusion ? "Guardando..." : `Registrar para ${selectedIds.size}`}
              </Button>
              <Button variant="outline" onClick={() => setShowDifusionModal(false)} disabled={savingDifusion}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
