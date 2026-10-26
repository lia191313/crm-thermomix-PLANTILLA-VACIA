import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Estilo de las fichas de formación de Vorwerk (VORyou), elegido para la app
// (21/10/2026): verde Thermomix, títulos en mayúsculas en naranja o
// azul y recuadros con borde de color. Sin logos de la marca.
export const TMX = { verde: "#00A650", naranja: "#F39200", azul: "#2E7BC4" };

/** Cabecera de pantalla: icono en un círculo de color, título y subtítulo en verde. */
export function CabeceraFormacion({
  icono: Icono, titulo, subtitulo, mayusculas = true, color = TMX.naranja, children,
}: {
  icono: LucideIcon;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  mayusculas?: boolean;
  color?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: color }}>
        <Icono size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className={`font-display font-medium text-3xl text-gray-700 ${mayusculas ? "uppercase tracking-wide" : ""}`}>{titulo}</h1>
        {subtitulo && (
          <p className="font-medium first-letter:uppercase" style={{ color: TMX.verde }}>{subtitulo}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function TituloSeccion({ color, icono: Icono, className = "", children }: { color: string; icono: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <h2 className={`font-display font-medium uppercase tracking-wide text-lg flex items-center gap-2 ${className}`} style={{ color }}>
      <Icono size={20} /> {children}
    </h2>
  );
}

export function Recuadro({ color, className = "", id, children }: { color: string; className?: string; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={`rounded-2xl border-2 bg-white p-1.5 sm:p-4 ${className}`} style={{ borderColor: color }}>
      {children}
    </div>
  );
}
