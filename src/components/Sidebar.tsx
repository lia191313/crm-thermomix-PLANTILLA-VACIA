import { LogOut, Download } from "lucide-react";
import { GRUPOS_MENU } from "./menuApp";
import { toast } from "sonner";
import { exportarCopiaCompleta } from "../lib/backup";

interface SidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
  onSignOut: () => void;
}

export default function Sidebar({ activeSection, onNavigate, onSignOut }: SidebarProps) {

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

      {/* Navigation, agrupada por temas (components/menuApp.ts) */}
      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        {GRUPOS_MENU.map((grupo) => (
          <div key={grupo.titulo} className="space-y-1">
            <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{grupo.titulo}</p>
            {grupo.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/10"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Backup & Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="grid grid-cols-1 gap-2 mb-2">
          <button 
            onClick={handleExport}
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/10 text-sidebar-foreground transition-all"
            title="Descargar copia de seguridad COMPLETA (clientes, notas, ventas, listados...)"
          >
            <Download className="w-4 h-4 mb-1" />
            <span className="text-[10px] font-bold uppercase">Exportar</span>
          </button>
        </div>
        <button
          onClick={() => {
            if (confirm("¿Seguro que quieres salir? Para volver a entrar tendrás que poner tu contraseña.")) onSignOut();
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-sidebar-foreground hover:bg-sidebar-accent/10 rounded-lg transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Salir</span>
        </button>
      </div>
    </aside>
  );
}
