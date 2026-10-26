import { Download, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { exportarCopiaCompleta } from "@/lib/backup";
import { GRUPOS_MENU, BARRA_MOVIL, ITEMS_MENU } from "./menuApp";

interface MobileNavProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

// Móvil (21/10/2026): 4 botones fijos abajo y "Más", que abre todo el menú
// agrupado por temas (components/menuApp.ts) y la copia de seguridad.
export default function MobileNav({ activeSection, onNavigate }: MobileNavProps) {
  const [verMas, setVerMas] = useState(false);

  const fijos = BARRA_MOVIL.map((id) => ITEMS_MENU.find((i) => i.id === id)!).filter(Boolean);
  const activoEnMas = !BARRA_MOVIL.includes(activeSection);

  const ir = (id: string) => {
    setVerMas(false);
    onNavigate(id);
  };

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
      setVerMas(false);
    } catch (error) {
      toast.dismiss(aviso);
      console.error("Error en exportación:", error);
      toast.error("No se pudo hacer la copia. Revisa la conexión e inténtalo de nuevo.");
    }
  };

  return (
    <>
      {/* "Más": todo el menú, por temas */}
      {verMas && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setVerMas(false)}>
          <div
            className="absolute bottom-16 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-sidebar border-t border-sidebar-border p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <span className="font-display font-medium uppercase tracking-wide text-sidebar-foreground">Menú</span>
              <button onClick={() => setVerMas(false)} className="text-sidebar-foreground p-1" title="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            {GRUPOS_MENU.map((grupo) => (
              <div key={grupo.titulo} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{grupo.titulo}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {grupo.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => ir(item.id)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left ${
                          isActive ? "bg-primary text-primary-foreground" : "bg-background text-sidebar-foreground"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-sidebar-border text-sidebar-foreground text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="font-medium">Descargar copia completa</span>
            </button>
          </div>
        </div>
      )}

      {/* Barra de navegación inferior */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border z-50">
        <div className="grid grid-cols-5 h-16">
          {fijos.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id && !verMas;
            return (
              <button
                key={item.id}
                onClick={() => ir(item.id)}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.corto ?? item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setVerMas(!verMas)}
            className={`flex flex-col items-center justify-center gap-1 transition-colors ${
              verMas || activoEnMas ? "bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
