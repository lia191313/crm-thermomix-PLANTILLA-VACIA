import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Contact } from "@/data/contacts";
import { X, Star } from "lucide-react";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact;
  onSave: (contact: Omit<Contact, "id">) => Promise<void>;
}

export default function ContactDialog({ open, onOpenChange, contact, onSave }: ContactDialogProps) {
  const [formData, setFormData] = useState<Omit<Contact, "id">>({
    nombre: contact?.nombre || "",
    telefono: contact?.telefono || "",
    notas: contact?.notas || "",
    modelo: contact?.modelo?.startsWith("⭐") ? contact.modelo.replace("⭐ ", "") : contact?.modelo || "TM5",
    ubicacion: contact?.ubicacion || "",
    ultimoContacto: contact?.ultimoContacto || null,
    intereses: contact?.intereses || [],
  });

  const [isMio, setIsMio] = useState(contact?.modelo?.startsWith("⭐") || false);
  const [actualModelo, setActualModelo] = useState(
    contact?.modelo?.startsWith("⭐") ? contact.modelo.replace("⭐ ", "") : contact?.modelo || "TM5"
  );
  const [newInterest, setNewInterest] = useState("");
  const predefinedInterests = ["clases", "clases online", "reparacion", "cambio", "adopcion", "promociones", "online", "TM7"];

  const handleSave = async () => {
    const updatedFormData = {
      ...formData,
      modelo: isMio ? `⭐ ${formData.modelo}` : formData.modelo,
    };
    await onSave(updatedFormData);
    onOpenChange(false);
  };

  const addInterest = () => {
    if (newInterest.trim()) {
      setFormData({
        ...formData,
        intereses: [...formData.intereses, newInterest.trim()],
      });
      setNewInterest("");
    }
  };

  const removeInterest = (index: number) => {
    setFormData({
      ...formData,
      intereses: formData.intereses.filter((_, i) => i !== index),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar Contacto" : "Nuevo Contacto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
          <div>
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre del contacto"
            />
          </div>

          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="+34 XXX XXX XXX"
            />
          </div>

          <div>
            <Label htmlFor="modelo">Modelo Thermomix</Label>
            <div className="flex gap-2">
              <select
                id="modelo"
                value={isMio ? `⭐ ${formData.modelo}` : formData.modelo}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.startsWith("⭐")) {
                    setFormData({ ...formData, modelo: value.replace("⭐ ", "") });
                  } else {
                    setFormData({ ...formData, modelo: value });
                  }
                }}
                className="flex-1 px-3 py-2 border border-input rounded-md bg-background"
              >
                <option value="TM5">{isMio ? "⭐ TM5" : "TM5"}</option>
                <option value="TM6">{isMio ? "⭐ TM6" : "TM6"}</option>
                <option value="TM7">{isMio ? "⭐ TM7" : "TM7"}</option>
                <option value="TM31">{isMio ? "⭐ TM31" : "TM31"}</option>
                <option value="Desconocido">{isMio ? "⭐ Desconocido" : "Desconocido"}</option>
              </select>
              <button
                onClick={() => setIsMio(!isMio)}
                className={`px-4 py-2 rounded-md border transition-all flex items-center gap-2 ${
                  isMio
                    ? "bg-yellow-100 border-yellow-400 text-yellow-700"
                    : "bg-gray-100 border-gray-300 text-gray-600 hover:border-yellow-400"
                }`}
                title="Marcar como 'Mío' (Venta propia)"
              >
                <Star className={`w-4 h-4 ${ isMio ? "fill-current" : ""}`} />
              </button>
            </div>
            {isMio && (
              <p className="text-xs text-yellow-700 mt-2 font-medium">⭐ Marcado como contacto propio (Mío)</p>
            )}
          </div>

          <div>
            <Label htmlFor="ubicacion">Ubicación</Label>
            <Input
              id="ubicacion"
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              placeholder="Ciudad o zona"
            />
          </div>

          <div>
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              placeholder="Notas sobre el contacto"
              rows={3}
            />
          </div>

          <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div>
              <Label className="text-sm font-bold text-blue-900">Intereses / Etiquetas</Label>
              <p className="text-xs text-blue-700 mt-1">Selecciona etiquetas predefinidas o crea nuevas</p>
            </div>
            
            {/* Etiquetas Predefinidas */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Etiquetas sugeridas:</p>
              <div className="flex flex-wrap gap-2">
                {predefinedInterests.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => {
                      if (!formData.intereses.includes(interest)) {
                        setFormData({
                          ...formData,
                          intereses: [...formData.intereses, interest],
                        });
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all border ${
                      formData.intereses.includes(interest)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                    }`}
                  >
                    {formData.intereses.includes(interest) ? "✓" : "+"} {interest}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Añadir Etiqueta Personalizada */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">O crea una nueva:</p>
              <div className="flex gap-2">
                <Input
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  placeholder="Escribe una etiqueta nueva..."
                  onKeyPress={(e) => e.key === "Enter" && addInterest()}
                  className="text-sm"
                />
                <Button onClick={addInterest} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  Añadir
                </Button>
              </div>
            </div>
            
            {/* Etiquetas Seleccionadas */}
            {formData.intereses.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Etiquetas seleccionadas:</p>
                <div className="flex flex-wrap gap-2">
                  {formData.intereses.map((interest, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-full shadow-sm"
                    >
                      {interest}
                      <button
                        onClick={() => removeInterest(index)}
                        className="hover:opacity-70 transition-opacity"
                        title="Eliminar etiqueta"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {contact ? "Actualizar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
