import { BarChart3, Users, Utensils, Clock, History, MessageSquare, Calendar, Download, Upload, Menu, ShoppingBag, TrendingUp, FileText, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { exportarCopiaCompleta, restaurarDatosLocales } from "@/lib/backup";

interface MobileNavProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

export default function MobileNav({ activeSection, onNavigate }: MobileNavProps) {
  const [showSyncMenu, setShowSyncMenu] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "reporte-diario", label: "Reporte", icon: FileText },
    { id: "ventas", label: "Ventas", icon: ShoppingBag },
    { id: "rendimiento", label: "Métricas", icon: TrendingUp },
    { id: "planning", label: "Planning", icon: Calendar },
    { id: "contactos", label: "Contactos", icon: Users },
    { id: "listados", label: "Listados", icon: ClipboardList },
    { id: "recordatorios", label: "Recordat.", icon: Clock },
    { id: "plantillas", label: "Plantillas", icon: MessageSquare },
  ];

  const handleExport = async () => {
    const aviso = toast.loading("Preparando la copia completa...");
    try {
      const r = await exportarCopiaCompleta();
      toast.dismiss(aviso);
      if (r.errores.length > 0) {
        toast.warning(`Copia descargada (${r.clientes} clientes, ${r.totalFilas} registros), pero no se pudo leer: ${r.errores.join(", ")}`);
      } else {
        toast.success(`Copia completa descargada: ${r.clientes} clientes y ${r.totalFilas} registros en total`);
      }
      setShowSyncMenu(false);
    } catch (error) {
      toast.dismiss(aviso);
      console.error("Error en exportación:", error);
      toast.error("No se pudo hacer la copia. Revisa la conexión e inténtalo de nuevo.");
    }
  };

  // Restaura solo lo que se guarda en ESTE aparato (recetas y anotaciones
  // personalizadas...). Los clientes, ventas, listados, etc. están en la nube.
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const n = restaurarDatosLocales(JSON.parse(String(event.target?.result ?? "")));
          toast.success(`Restaurados ${n} datos de este aparato (recetas, anotaciones...). Recargando...`);
      setShowSyncMenu(false);
          setTimeout(() => window.location.reload(), 1500);
        } catch {
          toast.error("Error al importar el archivo. Asegúrate de que sea una copia de la app.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <>
      {/* Menú de Sincronización (Desplegable en la parte superior) */}
      {showSyncMenu && (
        <div className="md:hidden fixed top-0 left-0 right-0 bg-sidebar border-b border-sidebar-border z-40 p-3 space-y-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-sidebar-foreground">Sincronización</span>
            <button onClick={() => setShowSyncMenu(false)} className="text-sidebar-foreground">✕</button>
          </div>
          <button
            onClick={handleExport}
            className="w-full flex items-center gap-2 p-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/10 text-sidebar-foreground transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Descargar copia completa</span>
          </button>
          <button
            onClick={handleImport}
            className="w-full flex items-center gap-2 p-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/10 text-sidebar-foreground transition-all"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">Restaurar recetas y anotaciones</span>
          </button>
        </div>
      )}

      {/* Barra de navegación inferior */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border z-50">
        <div className="flex justify-around items-center h-16 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center flex-shrink-0 w-16 h-full gap-1 transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium text-center">{item.label}</span>
              </button>
            );
          })}

          {/* Botón de Sincronización */}
          <button
            onClick={() => setShowSyncMenu(!showSyncMenu)}
            className="flex flex-col items-center justify-center flex-shrink-0 w-16 h-full gap-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Sincronización"
          >
            <Menu className="w-5 h-5 text-orange-500" />
            <span className="text-[9px] font-medium">Sincro</span>
          </button>
        </div>
      </nav>

      {/* Espaciador para que el contenido no se oculte bajo la barra */}
      {showSyncMenu && <div className="md:hidden h-24" />}
    </>
  );
}
