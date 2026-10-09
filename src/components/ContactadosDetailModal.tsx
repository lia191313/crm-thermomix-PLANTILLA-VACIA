import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Clock, User } from "lucide-react";
import { Contact } from "@/hooks/useContacts";
import { Contacto } from "@/hooks/useLlamadasGlobales";
import { confirmarLlamada } from "@/lib/callDialog";

interface ContactadosDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  contactos: Contacto[];
  contactsMap: Map<number, Contact>;
}

export default function ContactadosDetailModal({
  isOpen,
  onClose,
  title,
  contactos,
  contactsMap,
}: ContactadosDetailModalProps) {
  // Agrupar contactos por contactoId para obtener lista única de contactos
  const contactosUnicos = Array.from(
    new Map(
      contactos.map((c) => [
        c.contactoId,
        {
          contactoId: c.contactoId,
          interacciones: contactos.filter((x) => x.contactoId === c.contactoId),
        },
      ])
    ).values()
  );

  const handleCall = async (telefono: string) => {
    const phone = telefono.replace(/\D/g, "");
    if (phone) {
      await confirmarLlamada(phone);
    }
  };

  const handleWhatsApp = (telefono: string) => {
    const phone = telefono.replace(/\D/g, "");
    if (phone) {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent("Hola, ¿cómo estás?")}`;
      window.open(url, "_blank");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {contactosUnicos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No hay contactos en este período</p>
            </div>
          ) : (
            contactosUnicos.map((item) => {
              const contact = contactsMap.get(item.contactoId);
              if (!contact) return null;

              const ultimaInteraccion = item.interacciones[0];

              return (
                <Card key={item.contactoId} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <User size={16} className="text-muted-foreground flex-shrink-0" />
                        <h3 className="font-semibold truncate">{contact.nombre}</h3>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p className="truncate">{contact.ubicacion}</p>
                        <div className="flex items-center gap-2">
                          <Clock size={14} />
                          <span>
                            {ultimaInteraccion.fechaLocal} {ultimaInteraccion.horaLocal}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.interacciones.map((inter) => (
                            <span
                              key={inter.id}
                              className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded capitalize"
                            >
                              {inter.tipo}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCall(contact.telefono)}
                        title="Llamar"
                      >
                        <Phone size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWhatsApp(contact.telefono)}
                        title="WhatsApp"
                      >
                        <MessageCircle size={16} />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
