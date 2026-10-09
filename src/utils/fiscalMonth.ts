// =============================================================
// fiscalMonth — Cálculo de "mes fiscal Thermomix"
// -------------------------------------------------------------
// Thermomix cierra cada mes en un día distinto que cambia cada
// año. La regla es:
//
//   - Días desde 1 hasta el día de cierre INCLUSIVE → mes fiscal X.
//   - Días desde (cierre+1) hasta fin de calendario → mes fiscal X+1.
//
// Ejemplo con datos de 2026 (abril cierra el 27, mayo cierra el 25):
//   - 27-abril → mes fiscal Abril
//   - 28-abril → mes fiscal Mayo  ← ya cuenta como "el siguiente"
//   - 25-mayo  → mes fiscal Mayo
//   - 26-mayo  → mes fiscal Junio
//
// Para actualizar con un nuevo año, añade una entrada al objeto
// FISCAL_CLOSE_DAYS_BY_YEAR con los 12 días de cierre que te
// envíe Thermomix para ese ejercicio. El resto de la app se
// adapta sola.
// =============================================================

/**
 * Días de cierre Thermomix por año y mes (1-indexed: 1 = enero, 12 = diciembre).
 *
 * IMPORTANTE: si el año o el mes que se consulta no existe en este mapa,
 * la función `getCloseDay` cae en un fallback al último día calendario
 * del mes (calendario clásico). Eso evita que el código se rompa con
 * datos antiguos o futuros sin configurar; solo significa que las cuentas
 * de meses fuera del rango configurado serán las "estándar de calendario".
 */
const FISCAL_CLOSE_DAYS_BY_YEAR: Record<number, Record<number, number>> = {
  2026: {
    1: 26,   // enero
    2: 23,   // febrero
    3: 30,   // marzo
    4: 27,   // abril
    5: 25,   // mayo
    6: 29,   // junio
    7: 27,   // julio
    8: 24,   // agosto
    9: 28,   // septiembre
    10: 26,  // octubre
    11: 23,  // noviembre
    12: 28,  // diciembre
  },
  // 2027: { 1: ..., 2: ..., ..., 12: ... },
  // Cuando Thermomix te pase los días de 2027, añade el bloque aquí.
};

/** Día de cierre del mes/año dado. Cae a último día de calendario si no hay datos. */
function getCloseDay(year: number, month1Indexed: number): number {
  const yearData = FISCAL_CLOSE_DAYS_BY_YEAR[year];
  if (yearData && yearData[month1Indexed] !== undefined) {
    return yearData[month1Indexed];
  }
  // Último día calendario del mes (con `Date(year, month, 0)`, el día 0 del
  // mes siguiente es el último del mes actual).
  return new Date(year, month1Indexed, 0).getDate();
}

export interface FiscalMonth {
  year: number;
  /** 1-indexed: 1=enero, 12=diciembre. */
  month: number;
}

/** Devuelve el mes fiscal al que pertenece la fecha dada. */
export function fiscalMonthOf(date: Date): FiscalMonth {
  const day = date.getDate();
  const calendarMonth = date.getMonth() + 1; // JS Date.getMonth() es 0-indexed
  const calendarYear = date.getFullYear();
  const closeDay = getCloseDay(calendarYear, calendarMonth);
  if (day <= closeDay) {
    // Estamos dentro del mes fiscal correspondiente al mes calendario.
    return { year: calendarYear, month: calendarMonth };
  }
  // Día > cierre → cuenta para el mes fiscal siguiente.
  if (calendarMonth === 12) {
    return { year: calendarYear + 1, month: 1 };
  }
  return { year: calendarYear, month: calendarMonth + 1 };
}

/**
 * Devuelve el rango [start, endExclusive] del mes fiscal indicado:
 *   - start: día siguiente al cierre del mes fiscal anterior, a las 00:00.
 *   - endExclusive: día siguiente al cierre de este mes fiscal, a las 00:00.
 * Pensado para usar con `fecha >= start && fecha < endExclusive`.
 */
export function fiscalMonthBounds(fm: FiscalMonth): { start: Date; endExclusive: Date } {
  // Mes fiscal anterior (su día de cierre marca el inicio del actual).
  const prevYear = fm.month === 1 ? fm.year - 1 : fm.year;
  const prevMonth = fm.month === 1 ? 12 : fm.month - 1;
  const prevClose = getCloseDay(prevYear, prevMonth);

  // Inicio: día siguiente al cierre del mes anterior. Si prevClose+1 desborda
  // el último día del mes anterior, JS lo desliza al mes siguiente automáticamente
  // (que es exactamente lo que queremos, aunque normalmente prevClose+1 ≤ 31).
  const start = new Date(prevYear, prevMonth - 1, prevClose + 1);
  start.setHours(0, 0, 0, 0);

  // Fin (exclusivo): día siguiente al cierre del mes fiscal actual.
  const close = getCloseDay(fm.year, fm.month);
  const endExclusive = new Date(fm.year, fm.month - 1, close + 1);
  endExclusive.setHours(0, 0, 0, 0);

  return { start, endExclusive };
}

/** ¿La fecha pertenece al mes fiscal indicado? */
export function isInFiscalMonth(date: Date, fm: FiscalMonth): boolean {
  const { start, endExclusive } = fiscalMonthBounds(fm);
  return date >= start && date < endExclusive;
}

/** Mes fiscal inmediatamente anterior. */
export function previousFiscalMonth(fm: FiscalMonth): FiscalMonth {
  if (fm.month === 1) return { year: fm.year - 1, month: 12 };
  return { year: fm.year, month: fm.month - 1 };
}

/** Mes fiscal inmediatamente siguiente. */
export function nextFiscalMonth(fm: FiscalMonth): FiscalMonth {
  if (fm.month === 12) return { year: fm.year + 1, month: 1 };
  return { year: fm.year, month: fm.month + 1 };
}

/**
 * Etiqueta legible del mes fiscal:
 *   - sin opciones: "Mayo 2026"
 *   - { short: true }: "may." (como en las gráficas históricas)
 */
export function fiscalMonthLabel(fm: FiscalMonth, options: { short?: boolean } = {}): string {
  const date = new Date(fm.year, fm.month - 1, 1);
  const monthName = date.toLocaleDateString("es-ES", {
    month: options.short ? "short" : "long",
  });
  if (options.short) return monthName;
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${fm.year}`;
}
