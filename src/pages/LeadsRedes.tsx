import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import { useSupabaseLeads, type SupabaseLead } from "@/hooks/useSupabaseLeads";
import { toast } from "sonner";

const PLATAFORMAS = ["Vinted", "Wallapop", "Facebook", "Milanuncios", "Otro"];
const ESTADOS = ["Nuevo", "Contactado", "Interesado", "Demo programada", "Venta", "Descartado"];

const PLATAFORMA_COLORS: Record<string, string> = {
  Vinted: "bg-violet-100 text-violet-700 border-violet-200",
  Wallapop: "bg-teal-100 text-teal-700 border-teal-200",
  Facebook: "bg-blue-100 text-blue-700 border-blue-200",
  Milanuncios: "bg-amber-100 text-amber-700 border-amber-200",
  Otro: "bg-gray-100 text-gray-600 border-gray-200",
};

const ESTADO_COLORS: Record<string, string> = {
  Nuevo: "bg-sky-100 text-sky-700",
  Contactado: "bg-yellow-100 text-yellow-700",
  Interesado: "bg-orange-100 text-orange-700",
  "Demo programada": "bg-purple-100 text-purple-700",
  Venta: "bg-green-100 text-green-700",
  Descartado: "bg-red-100 text-red-500",
};

const LEADS_PER_PAGE = 25;

type LeadFormData = {
  nombre: string;
  alias: string;
  telefono: string;
  plataforma: string;
  estado: string;
  enlace_anuncio: string;
  notas: string;
};

const emptyForm: LeadFormData = {
  nombre: "",
  alias: "",
  telefono: "",
  plataforma: "Vinted",
  estado: "Nuevo",
  enlace_anuncio: "",
  notas: "",
};

export default function LeadsRedes() {
  const { leads, loading, addLead, updateLead, deleteLead } = useSupabaseLeads();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<SupabaseLead | null>(null);
  const [form, setForm] = useState<LeadFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlataforma, setFilterPlataforma] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.alias ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.telefono ?? "").includes(searchTerm) ||
        (lead.notas ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPlataforma = !filterPlataforma || lead.plataforma === filterPlataforma;
      const matchesEstado = !filterEstado || lead.estado === filterEstado;
      return matchesSearch && matchesPlataforma && matchesEstado;
    });
  }, [leads, searchTerm, filterPlataforma, filterEstado]);

  const totalPages = Math.ceil(filteredLeads.length / LEADS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * LEADS_PER_PAGE,
    currentPage * LEADS_PER_PAGE
  );

  const openNew = () => {
    setEditingLead(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (lead: SupabaseLead) => {
    setEditingLead(lead);
    setForm({
      nombre: lead.nombre,
      alias: lead.alias ?? "",
      telefono: lead.telefono ?? "",
      plataforma: lead.plataforma,
      estado: lead.estado,
      enlace_anuncio: lead.enlace_anuncio ?? "",
      notas: lead.notas ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        alias: form.alias.trim() || null,
        telefono: form.telefono.trim() || null,
        plataforma: form.plataforma,
        estado: form.estado,
        enlace_anuncio: form.enlace_anuncio.trim() || null,
        notas: form.notas.trim() || null,
      };
      if (editingLead) {
        await updateLead(editingLead.id, payload);
        toast.success("Lead actualizado");
      } else {
        await addLead(payload);
        toast.success("Lead añadido");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Error al guardar el lead");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este lead?")) return;
    try {
      await deleteLead(id);
      toast.success("Lead eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Leads Redes</h1>
          <p className="text-muted-foreground mt-1">
            {filteredLeads.length} de {leads.length} leads · Vinted, Wallapop, Facebook, Milanuncios
          </p>
        </div>
        <Button onClick={openNew} className="w-full md:w-auto bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Lead
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, alias, teléfono o notas..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={filterPlataforma}
            onChange={(e) => { setFilterPlataforma(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
          >
            <option value="">Todas las plataformas</option>
            {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterEstado}
            onChange={(e) => { setFilterEstado(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </Card>

      {/* Table — Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alias / Usuario</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {lead.nombre}
                      {lead.enlace_anuncio && (
                        <a
                          href={lead.enlace_anuncio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                          title="Ver anuncio"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${PLATAFORMA_COLORS[lead.plataforma] ?? PLATAFORMA_COLORS.Otro}`}>
                      {lead.plataforma}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_COLORS[lead.estado] ?? "bg-gray-100 text-gray-600"}`}>
                      {lead.estado}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.alias || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{lead.notas || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(lead.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(lead)}
                        className="p-2 hover:bg-blue-100 rounded transition"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="p-2 hover:bg-red-100 rounded transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {paginatedLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No se encontraron leads
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Cards — Mobile */}
      <div className="md:hidden space-y-3">
        {paginatedLeads.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No se encontraron leads</p>
          </Card>
        )}
        {paginatedLeads.map((lead) => (
          <Card key={lead.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground">{lead.nombre}</h3>
                  {lead.enlace_anuncio && (
                    <a
                      href={lead.enlace_anuncio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{lead.alias || lead.telefono || "Sin alias"}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(lead)} className="p-2 hover:bg-blue-100 rounded transition">
                  <Edit className="w-4 h-4 text-blue-600" />
                </button>
                <button onClick={() => handleDelete(lead.id)} className="p-2 hover:bg-red-100 rounded transition">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-1 text-xs font-medium rounded border ${PLATAFORMA_COLORS[lead.plataforma] ?? PLATAFORMA_COLORS.Otro}`}>
                {lead.plataforma}
              </span>
              <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_COLORS[lead.estado] ?? "bg-gray-100 text-gray-600"}`}>
                {lead.estado}
              </span>
              <span className="px-2 py-1 text-xs text-muted-foreground bg-gray-50 rounded">
                {formatDate(lead.created_at)}
              </span>
            </div>
            {lead.notas && (
              <p className="text-sm text-muted-foreground line-clamp-2">{lead.notas}</p>
            )}
          </Card>
        ))}
      </div>

      {/* Pagination */}
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

      {/* Dialog — Formulario */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLead ? "Editar Lead" : "Nuevo Lead"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre del contacto"
              />
            </div>

            <div>
              <Label htmlFor="alias">Alias / Usuario en la plataforma</Label>
              <Input
                id="alias"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="Ej: @usuario_vinted"
              />
            </div>

            <div>
              <Label htmlFor="telefono">Teléfono (opcional)</Label>
              <Input
                id="telefono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="+34 XXX XXX XXX"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="plataforma">Plataforma</Label>
                <select
                  id="plataforma"
                  value={form.plataforma}
                  onChange={(e) => setForm({ ...form, plataforma: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md bg-background text-foreground"
                >
                  {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="estado">Estado</Label>
                <select
                  id="estado"
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-input rounded-md bg-background text-foreground"
                >
                  {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="enlace">Enlace al perfil o anuncio (opcional)</Label>
              <Input
                id="enlace"
                value={form.enlace_anuncio}
                onChange={(e) => setForm({ ...form, enlace_anuncio: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Detalles del anuncio, interés del lead..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : editingLead ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
