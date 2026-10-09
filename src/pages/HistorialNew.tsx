import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Phone, MessageCircle, MessageSquare, FileText } from "lucide-react";
import { useInteractions } from "@/hooks/useInteractions";
import { useContacts } from "@/hooks/useContacts";

export default function Historial() {
  const { interactions, loading: loadingInteractions } = useInteractions();
  const { contacts, loading: loadingContacts } = useContacts();
  const loading = loadingInteractions || loadingContacts;
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("");

  const filteredInteractions = useMemo(() => {
    return interactions.filter((interaction) => {
      const contact = contacts.find((c) => c.id === interaction.contactId);
      const contactName = contact?.nombre || "Desconocido";

      const matchesSearch = contactName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType = !filterType || interaction.type === filterType;

      return matchesSearch && matchesType;
    });
  }, [interactions, contacts, searchTerm, filterType]);

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case "llamada":
        return <Phone className="w-4 h-4 text-blue-600" />;
      case "whatsapp":
        return <MessageCircle className="w-4 h-4 text-green-600" />;
      case "mensaje":
        return <MessageSquare className="w-4 h-4 text-purple-600" />;
      case "nota":
        return <FileText className="w-4 h-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getInteractionLabel = (type: string) => {
    switch (type) {
      case "llamada":
        return "Llamada";
      case "whatsapp":
        return "WhatsApp";
      case "mensaje":
        return "Mensaje";
      case "nota":
        return "Nota";
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Hoy a las ${date.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Ayer a las ${date.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      return date.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando historial...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Historial</h1>
        <p className="text-muted-foreground mt-1">
          {filteredInteractions.length} de {interactions.length} interacciones
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre de contacto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
          >
            <option value="">Todos los tipos</option>
            <option value="llamada">Llamada</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="mensaje">Mensaje</option>
            <option value="nota">Nota</option>
          </select>
        </div>
      </Card>

      {/* Timeline */}
      <div className="space-y-3">
        {filteredInteractions.length > 0 ? (
          filteredInteractions.map((interaction) => {
            const contact = contacts.find((c) => c.id === interaction.contactId);
            return (
              <Card key={interaction.id} className="p-4">
                <div className="flex gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    {getInteractionIcon(interaction.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-foreground">
                          {contact?.nombre || "Contacto desconocido"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {getInteractionLabel(interaction.type)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(interaction.date)}
                      </p>
                    </div>

                    {interaction.description && (
                      <p className="text-sm text-foreground mt-2">
                        {interaction.description}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No hay interacciones registradas</p>
          </Card>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">
            {interactions.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Llamadas</p>
          <p className="font-display text-2xl font-bold text-blue-600 mt-1">
            {interactions.filter((i) => i.type === "llamada").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">WhatsApp</p>
          <p className="font-display text-2xl font-bold text-green-600 mt-1">
            {interactions.filter((i) => i.type === "whatsapp").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Mensajes</p>
          <p className="font-display text-2xl font-bold text-purple-600 mt-1">
            {interactions.filter((i) => i.type === "mensaje").length}
          </p>
        </Card>
      </div>
    </div>
  );
}
