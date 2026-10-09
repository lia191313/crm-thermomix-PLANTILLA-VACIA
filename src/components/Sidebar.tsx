import { Users, Utensils, History, BarChart3, LogOut, MessageSquare, Clock, Calendar, Download, Upload, ShoppingBag, TrendingUp, FileText, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { exportarCopiaCompleta, restaurarDatosLocales } from "../lib/backup";

interface SidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

export default function Sidebar({ activeSection, onNavigate }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "reporte-diario", label: "Reporte Diario", icon: FileText },
    { id: "ventas", label: "Ventas y Bienvenidas", icon: ShoppingBag },
    { id: "rendimiento", label: "Mi Rendimiento", icon: TrendingUp },
    { id: "planning", label: "Planning Mensual", icon: Calendar },
    { id: "contactos", label: "Contactos", icon: Users },
    { id: "listados", label: "Listados", icon: ClipboardList },
    { id: "recetas", label: "Recetas", icon: Utensils },
    { id: "recordatorios", label: "Recordatorios", icon: Clock },
    { id: "historial-contactos", label: "Historial", icon: History },
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
    <aside className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col sticky top-0">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <span className="text-sidebar-primary-foreground font-bold text-lg">TM</span>
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-sidebar-foreground">Thermomix CRM</h1>
            <p className="text-xs text-sidebar-foreground/60">Rotativo</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/10"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          )}
        )}
      </nav>

      {/* Backup & Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button 
            onClick={handleExport}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/10 text-sidebar-foreground transition-all"
            title="Descargar copia de seguridad COMPLETA (clientes, notas, ventas, listados...)"
          >
            <Download className="w-4 h-4 mb-1" />
            <span className="text-[10px] font-bold uppercase">Exportar</span>
          </button>
          <button 
            onClick={handleImport}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/10 text-sidebar-foreground transition-all"
            title="Restaurar en este aparato las recetas y anotaciones de una copia"
          >
            <Upload className="w-4 h-4 mb-1" />
            <span className="text-[10px] font-bold uppercase">Importar</span>
          </button>
        </div>
        <button className="w-full flex items-center gap-3 px-4 py-2 text-sidebar-foreground hover:bg-sidebar-accent/10 rounded-lg transition-all">
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Salir</span>
        </button>
      </div>
    </aside>
  );
}
