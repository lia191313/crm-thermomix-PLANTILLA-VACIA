// "Mis comisiones" (25/10/2026): cuentas sobre las facturas mensuales de
// comisiones de Vorwerk (tabla `comisiones`, supabase/crear_comisiones.sql).
// Cada factura: base − IRPF 15 % = neto. La factura pone además un IVA 21 %
// que Vorwerk NO paga (comprobado con el banco): se guarda solo para el gestor.

export interface ComisionMes {
  mes: string; // "2026-05"
  factura: string | null;
  fecha_factura: string | null;
  base: number;
  iva_factura: number;
  irpf: number;
  nac_retenidas: number;
  basicas: number;
  bono: number;
  icb: number;
  reclutamiento: number;
  grupo: number;
  especie: number;
  cobrado: number | null;
  fecha_cobro: string | null;
  notas: string | null;
}

/** Partes de la comisión, en el orden en que se enseñan. */
export const CONCEPTOS: { campo: keyof ComisionMes; label: string; ayuda: string }[] = [
  { campo: "basicas", label: "Ventas", ayuda: "165 € por cada venta tuya" },
  { campo: "bono", label: "Bono personal", ayuda: "bono por ventas del mes" },
  { campo: "icb", label: "ICB", ayuda: "40 € por clienta" },
  { campo: "reclutamiento", label: "Reclutamiento", ayuda: "por cada recluta" },
  { campo: "grupo", label: "Grupo", ayuda: "por las ventas de tu equipo" },
  { campo: "especie", label: "Premios en especie", ayuda: "vasos, TM7, trolley… tributan aunque no sean dinero" },
  { campo: "nac_retenidas", label: "Programa nuevo agente", ayuda: "comisiones retenidas al empezar" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const nombreMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};

export const neto = (c: Pick<ComisionMes, "base" | "irpf">) => redondear(c.base - c.irpf);

/** Trimestre natural de un mes: "2026-05" → "2T 2026" (es como lo pide Hacienda). */
export const trimestre = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${Math.ceil(m / 3)}T ${a}`;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface Totales {
  base: number;
  irpf: number;
  neto: number;
  especie: number;
  iva_factura: number;
  cobrado: number;
}

export function sumar(filas: ComisionMes[]): Totales {
  const t = filas.reduce(
    (acc, c) => ({
      base: acc.base + Number(c.base),
      irpf: acc.irpf + Number(c.irpf),
      neto: 0,
      especie: acc.especie + Number(c.especie),
      iva_factura: acc.iva_factura + Number(c.iva_factura),
      cobrado: acc.cobrado + Number(c.cobrado ?? 0),
    }),
    { base: 0, irpf: 0, neto: 0, especie: 0, iva_factura: 0, cobrado: 0 },
  );
  return {
    base: redondear(t.base),
    irpf: redondear(t.irpf),
    neto: redondear(t.base - t.irpf),
    especie: redondear(t.especie),
    iva_factura: redondear(t.iva_factura),
    cobrado: redondear(t.cobrado),
  };
}

/** Totales por trimestre natural, del más reciente al más antiguo. */
export function porTrimestre(filas: ComisionMes[]): { trimestre: string; totales: Totales }[] {
  const grupos = new Map<string, ComisionMes[]>();
  for (const f of [...filas].sort((a, b) => b.mes.localeCompare(a.mes))) {
    const t = trimestre(f.mes);
    grupos.set(t, [...(grupos.get(t) ?? []), f]);
  }
  return [...grupos].map(([t, fs]) => ({ trimestre: t, totales: sumar(fs) }));
}

export const euros = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
