// Utilidades del apartado "Listados": leer el texto pegado y detectar
// duplicados contra los clientes (contacts) y el resto de listados.

export type EstadoPersona = "pendiente" | "adoptado" | "descartado";

export interface FilaListado {
  nombre: string;
  apellidos: string;
  telefono: string;
  poblacion: string;
  /** Opcional: anotación que ya viene con el listado. */
  notas?: string;
  /** Opcional: día para volver a llamar (AAAA-MM-DD). */
  rellamar_el?: string;
  /** Opcional: mejor por la mañana o por la tarde. */
  franja?: "manana" | "tarde";
  /** Si ya se la ha llamado antes de cargarla (columna "ya llamada"). */
  llamadas?: number;
  ultima_llamada?: string;
}

/** Deja solo los dígitos y quita el prefijo de España (34 / 0034). */
export function normalizarTelefono(telefono: string | null | undefined): string {
  let d = (telefono ?? "").replace(/\D/g, "");
  if (d.startsWith("0034")) d = d.slice(4);
  else if (d.length === 11 && d.startsWith("34")) d = d.slice(2);
  return d;
}

/** Minúsculas, sin acentos, sin símbolos (p. ej. el ⛔ de archivados) ni espacios dobles. */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nombreCompleto(p: { nombre: string; apellidos: string }): string {
  return `${p.nombre} ${p.apellidos}`.replace(/\s+/g, " ").trim();
}

/**
 * Convierte el texto pegado en filas. Una persona por línea con los campos
 * separados por "|" o tabulador: Nombre | Apellidos | Teléfono | Población,
 * y opcionalmente más columnas: una nota y, para las que ya se han llamado,
 * "ya llamada", "rellamar AAAA-MM-DD" y "mañana" / "tarde".
 * Ignora líneas vacías, la cabecera y las líneas de separación de tablas.
 */
export function parsearListado(texto: string): FilaListado[] {
  const filas: FilaListado[] = [];
  for (const lineaOriginal of texto.split(/\r?\n/)) {
    let linea = lineaOriginal.trim();
    if (!linea) continue;
    if (/^[|\s:-]+$/.test(linea)) continue; // |---|---| de tablas
    if (linea.startsWith("|")) linea = linea.slice(1);
    if (linea.endsWith("|")) linea = linea.slice(0, -1);
    const campos = linea.split(/\t|\|/).map((c) => c.trim());
    const [nombre = "", apellidos = "", telefono = "", poblacion = "", ...resto] = campos;
    if (normalizarNombre(nombre) === "nombre" && /tel/i.test(telefono)) continue; // cabecera
    if (!nombre && !apellidos && !telefono) continue;
    const fila: FilaListado = { nombre, apellidos, telefono, poblacion };
    const notas: string[] = [];
    for (const extra of resto) {
      const rellamar = extra.match(/^rellamar\s+(\d{4}-\d{2}-\d{2})$/i);
      const franja = normalizarNombre(extra);
      if (rellamar) fila.rellamar_el = rellamar[1];
      else if (franja === "manana" || franja === "tarde") fila.franja = franja;
      else if (franja === "ya llamada" || franja === "ya llamado") {
        fila.llamadas = 1;
        fila.ultima_llamada = new Date().toISOString();
      } else if (extra) notas.push(extra);
    }
    if (notas.length) fila.notas = notas.join(" | ");
    filas.push(fila);
  }
  return filas;
}

export interface ClienteBasico {
  id: number;
  nombre: string;
  telefono: string | null;
}

export interface PersonaBasica {
  id: number;
  listado_id: number | null;
  nombre: string;
  apellidos: string;
  telefono: string;
  estado: EstadoPersona;
}

export type TipoAviso = "cliente" | "descartada" | "otro_listado" | "repetida" | "nombre_cliente" | "nombre_listado";

export interface Aviso {
  tipo: TipoAviso;
  texto: string;
  /** Avisos graves: la fila sale desmarcada por defecto. */
  grave: boolean;
}

/**
 * Para cada fila nueva devuelve la lista de avisos:
 * - por teléfono: ya es cliente, ya se descartó, ya está en otro listado,
 *   o sale repetida dentro del propio listado;
 * - por nombre (si el teléfono no coincide): mismo nombre que un cliente o
 *   que alguien de otro listado.
 */
export function detectarDuplicados(
  filas: FilaListado[],
  clientes: ClienteBasico[],
  personas: PersonaBasica[],
  nombreListado: (listadoId: number | null) => string
): Aviso[][] {
  const clientesPorTel = new Map<string, ClienteBasico>();
  const clientesPorNombre = new Map<string, ClienteBasico>();
  for (const c of clientes) {
    const tel = normalizarTelefono(c.telefono);
    if (tel.length >= 6 && !clientesPorTel.has(tel)) clientesPorTel.set(tel, c);
    const nom = normalizarNombre(c.nombre);
    if (nom && !clientesPorNombre.has(nom)) clientesPorNombre.set(nom, c);
  }

  const personasPorTel = new Map<string, PersonaBasica[]>();
  const personasPorNombre = new Map<string, PersonaBasica[]>();
  for (const p of personas) {
    const tel = normalizarTelefono(p.telefono);
    if (tel.length >= 6) personasPorTel.set(tel, [...(personasPorTel.get(tel) ?? []), p]);
    const nom = normalizarNombre(nombreCompleto(p));
    if (nom) personasPorNombre.set(nom, [...(personasPorNombre.get(nom) ?? []), p]);
  }

  const vistasEnEsteListado = new Map<string, number>();

  return filas.map((fila, i) => {
    const avisos: Aviso[] = [];
    const tel = normalizarTelefono(fila.telefono);
    const nom = normalizarNombre(nombreCompleto(fila));
    const telValido = tel.length >= 6;

    if (telValido) {
      const cliente = clientesPorTel.get(tel);
      if (cliente) {
        avisos.push({ tipo: "cliente", texto: `Ya es cliente: ${cliente.nombre}`, grave: true });
      }
      const previas = personasPorTel.get(tel) ?? [];
      for (const p of previas) {
        if (p.estado === "descartado") {
          avisos.push({ tipo: "descartada", texto: `Ya la descartaste (${nombreListado(p.listado_id)})`, grave: true });
        } else if (p.estado === "pendiente") {
          avisos.push({ tipo: "otro_listado", texto: `Ya está en ${nombreListado(p.listado_id)}`, grave: false });
        }
        // Las adoptadas ya salen como "Ya es cliente".
      }
      const anterior = vistasEnEsteListado.get(tel);
      if (anterior !== undefined) {
        avisos.push({ tipo: "repetida", texto: `Repetida en este listado (fila ${anterior + 1})`, grave: true });
      } else {
        vistasEnEsteListado.set(tel, i);
      }
    }

    if (nom) {
      const cliente = clientesPorNombre.get(nom);
      if (cliente && !(telValido && clientesPorTel.get(tel) === cliente)) {
        avisos.push({
          tipo: "nombre_cliente",
          texto: `Se llama igual que tu cliente ${cliente.nombre} (otro teléfono)`,
          grave: false,
        });
      }
      const mismos = (personasPorNombre.get(nom) ?? []).filter(
        (p) => !(telValido && normalizarTelefono(p.telefono) === tel)
      );
      for (const p of mismos) {
        avisos.push({
          tipo: "nombre_listado",
          texto: `Se llama igual que alguien de ${nombreListado(p.listado_id)} (otro teléfono${p.estado === "descartado" ? ", descartada" : ""})`,
          grave: false,
        });
      }
    }

    return avisos;
  });
}

// ─── Rellamadas ──────────────────────────────────────────────────────────

/** Fecha local (no UTC) en formato AAAA-MM-DD, como la guarda la columna date. */
export function fechaISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sumarDias(dias: number, desde: Date = new Date()): string {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  return fechaISO(d);
}

/**
 * "hoy": pendiente con rellamada para hoy o ya pasada (toca llamar).
 * "programada": pendiente con rellamada para otro día (aún no molesta).
 */
export function estadoRellamada(
  p: { estado: EstadoPersona; rellamar_el?: string | null },
  hoy: string = fechaISO()
): "hoy" | "programada" | null {
  if (p.estado !== "pendiente" || !p.rellamar_el) return null;
  return p.rellamar_el <= hoy ? "hoy" : "programada";
}

/** "jue, 2 oct" */
export function formatDia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Franja horaria preferida ────────────────────────────────────────────

export type Franja = "manana" | "tarde";

export const FRANJA_LABEL: Record<Franja, string> = {
  manana: "☀️ Mañana",
  tarde: "🌙 Tarde",
};

/** Mañana hasta las 14:00; a partir de ahí, tarde. */
export function franjaActual(d: Date = new Date()): Franja {
  return d.getHours() < 14 ? "manana" : "tarde";
}

// ─── Abrir Listados con un filtro ya puesto (p. ej. desde el Dashboard) ───

const CLAVE_FILTRO_INICIAL = "thermomix_listados_filtro_inicial";

export function pedirFiltroInicialListados(filtro: string) {
  try {
    sessionStorage.setItem(CLAVE_FILTRO_INICIAL, filtro);
  } catch {
    // sin sessionStorage simplemente se abre con el filtro por defecto
  }
}

/** Devuelve el filtro pedido (y lo olvida, para que solo se use una vez). */
export function tomarFiltroInicialListados(): string | null {
  try {
    const f = sessionStorage.getItem(CLAVE_FILTRO_INICIAL);
    sessionStorage.removeItem(CLAVE_FILTRO_INICIAL);
    return f;
  } catch {
    return null;
  }
}

/**
 * Lo que se ha escrito en esta llamada: la parte nueva de las notas (sin la
 * fecha "dd/mm:" que se pone sola). Se guarda en el historial de llamadas.
 */
export function notaDeEstaLlamada(notasAntes: string, notasDespues: string, hoy: string): string {
  const antes = notasAntes.trim();
  let nueva = notasDespues.startsWith(antes) ? notasDespues.slice(antes.length) : notasDespues;
  nueva = nueva.trim();
  if (nueva.startsWith(`${hoy}:`)) nueva = nueva.slice(hoy.length + 1).trim();
  return nueva;
}

/**
 * Buscador "tolerante": ignora acentos, mayúsculas y símbolos en el nombre
 * ("Ines" encuentra "Inés"), y en el teléfono compara solo las cifras.
 */
export function coincideBusqueda(busqueda: string, nombre: string, telefono?: string | null): boolean {
  const termino = normalizarNombre(busqueda);
  if (!termino) return true;
  if (normalizarNombre(nombre).includes(termino)) return true;
  const cifras = busqueda.replace(/\D/g, "");
  return cifras.length >= 3 && (telefono ?? "").replace(/\D/g, "").includes(cifras);
}
