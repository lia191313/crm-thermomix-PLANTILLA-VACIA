import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabaseDemos } from "./useSupabaseDemos";
import { useContacts } from "./useContacts";
import {
  fiscalMonthOf,
  fiscalMonthBounds,
  previousFiscalMonth,
  fiscalMonthLabel,
  type FiscalMonth,
} from "@/utils/fiscalMonth";

export interface Demo {
  id: string;
  contactoId: number;
  contactoNombre: string;
  fecha: string; // ISO date
  resultado: "pendiente_venta" | "venta_cerrada" | "no_interesado" | "seguimiento";
  notas: string;
}

const STORAGE_KEY = "thermomix_demos";

// Detecta el resultado codificado por ModalDemo como prefijo "[Etiqueta]" en las notas.
function parseResultadoDeNotas(notas: string | null | undefined): Demo["resultado"] {
  if (!notas) return "pendiente_venta";
  const match = notas.match(/^\[([^\]]+)\]/);
  if (!match) return "pendiente_venta";
  const label = match[1].toLowerCase();
  if (label.startsWith("venta cerrada")) return "venta_cerrada";
  if (label.startsWith("no interesado")) return "no_interesado";
  if (label.startsWith("requiere seguimiento")) return "seguimiento";
  if (label.startsWith("pendiente")) return "pendiente_venta";
  return "pendiente_venta";
}

export function useDemos() {
  const [demosLocal, setDemosLocal] = useState<Demo[]>([]);
  const { demos: demosSupabase } = useSupabaseDemos();
  const { contacts } = useContacts();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setDemosLocal(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing demos", e);
      }
    }
  }, []);

  const save = (updated: Demo[]) => {
    setDemosLocal(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // Demos unificadas: localStorage (legacy) + Supabase (nuevas vía ModalDemo).
  // Mapeamos las de Supabase al formato Demo local para que todo el código que
  // consume `demos` siga funcionando igual sin cambios.
  const demos: Demo[] = useMemo(() => {
    const contactosMap = new Map(contacts.map((c) => [c.id, c.nombre]));
    const deSupabase: Demo[] = (demosSupabase ?? []).map((d) => ({
      id: `sb-${d.id}`,
      contactoId: d.contacto_id,
      contactoNombre: contactosMap.get(d.contacto_id) ?? "",
      // Usamos fecha_demo como ISO a medianoche local para que los cálculos por mes funcionen.
      fecha: new Date(d.fecha_demo + "T00:00:00").toISOString(),
      resultado: parseResultadoDeNotas(d.notas),
      notas: d.notas ?? "",
    }));
    // Deduplicar por posible coincidencia contacto+fecha (ignoramos duplicados exactos).
    const key = (x: Demo) => `${x.contactoId}|${x.fecha.split("T")[0]}|${x.resultado}`;
    const vistos = new Set<string>();
    const combinadas: Demo[] = [];
    [...demosLocal, ...deSupabase].forEach((d) => {
      const k = key(d);
      if (!vistos.has(k)) {
        vistos.add(k);
        combinadas.push(d);
      }
    });
    return combinadas;
  }, [demosLocal, demosSupabase, contacts]);

  const addDemo = useCallback(
    (data: Omit<Demo, "id">) => {
      const newDemo: Demo = { ...data, id: Date.now().toString() };
      save([...demosLocal, newDemo]);
      return newDemo;
    },
    [demosLocal]
  );

  const updateDemo = useCallback(
    (id: string, updates: Partial<Demo>) => {
      save(demosLocal.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    },
    [demosLocal]
  );

  const deleteDemo = useCallback(
    (id: string) => {
      save(demosLocal.filter((d) => d.id !== id));
    },
    [demosLocal]
  );

  const stats = useMemo(() => {
    // Stats por MES FISCAL Thermomix.
    const fmActual = fiscalMonthOf(new Date());
    const fmAnterior = previousFiscalMonth(fmActual);
    const { start: inicioMes, endExclusive: inicioMesSiguiente } = fiscalMonthBounds(fmActual);
    const { start: inicioMesAnterior, endExclusive: finMesAnteriorExc } = fiscalMonthBounds(fmAnterior);

    const demosMes = demos.filter((d) => {
      const fecha = new Date(d.fecha);
      return fecha >= inicioMes && fecha < inicioMesSiguiente;
    }).length;

    const demosMesAnterior = demos.filter((d) => {
      const fecha = new Date(d.fecha);
      return fecha >= inicioMesAnterior && fecha < finMesAnteriorExc;
    }).length;

    // Datos de los últimos 6 meses fiscales para la gráfica.
    const meses: FiscalMonth[] = [];
    let cursor = fmActual;
    for (let i = 0; i < 6; i++) {
      meses.unshift(cursor);
      cursor = previousFiscalMonth(cursor);
    }
    const ultimos6Meses = meses.map((fm) => {
      const { start, endExclusive } = fiscalMonthBounds(fm);
      const count = demos.filter((d) => {
        const f = new Date(d.fecha);
        return f >= start && f < endExclusive;
      }).length;
      return {
        mes: fiscalMonthLabel(fm, { short: true }),
        // Conservamos `mesNum` y `año` por si algún consumidor los lee, pero
        // ahora referencian al mes fiscal (1-indexed) y su año.
        mesNum: fm.month,
        año: fm.year,
        demos: count,
      };
    });

    return {
      demosMes,
      demosMesAnterior,
      ultimos6Meses,
      totalDemos: demos.length,
    };
  }, [demos]);

  const getDemosPorContacto = useCallback(
    (contactoId: number) => demos.filter((d) => d.contactoId === contactoId),
    [demos]
  );

  return {
    demos,
    addDemo,
    updateDemo,
    deleteDemo,
    stats,
    getDemosPorContacto,
  };
}
