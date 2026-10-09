// Ayudas del Reporte Diario: buscar y juntar las difusiones del día.
import { coincideBusqueda } from "@/lib/listados";

export interface ItemReporte {
  id: string;
  contactName: string;
  contactPhone: string;
  tipo: string;
  anotacion: string;
}

export interface GrupoDifusion<T> {
  texto: string;
  items: T[];
}

/** Coincide si el texto buscado está en el nombre, el teléfono o la anotación. */
export function coincideItem(busqueda: string, item: ItemReporte): boolean {
  if (!busqueda.trim()) return true;
  return (
    coincideBusqueda(busqueda, item.contactName, item.contactPhone) ||
    coincideBusqueda(busqueda, item.anotacion)
  );
}

/**
 * Separa las difusiones (un mismo mensaje enviado a mucha gente) del resto:
 * las difusiones con el mismo texto van juntas en un grupo, para que no
 * llenen el reporte. Respeta el orden en que llegan.
 */
export function agruparDifusiones<T extends ItemReporte>(items: T[]) {
  const individuales: T[] = [];
  const grupos: GrupoDifusion<T>[] = [];
  for (const item of items) {
    if (item.tipo !== "difusion") {
      individuales.push(item);
      continue;
    }
    const texto = item.anotacion.trim() || "Difusión";
    const grupo = grupos.find((g) => g.texto === texto);
    if (grupo) grupo.items.push(item);
    else grupos.push({ texto, items: [item] });
  }
  return { individuales, grupos };
}
