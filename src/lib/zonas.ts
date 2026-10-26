import { normalizarNombre } from "@/lib/listados";

// Zonas para agrupar las poblaciones de los listados (provincia de Barcelona).
// Se pueden cambiar o añadir pueblos aquí; lo que no esté sale en "Lejos / otros".
export const ZONAS = [
  "Barcelona",
  "L'Hospitalet y alrededores",
  "Delta y Castelldefels",
  "Baix Llobregat centro",
  "Baix Llobregat norte",
  "Garraf",
  "Penedès",
  "Lejos / otros",
] as const;
export type Zona = (typeof ZONAS)[number];

const PUEBLOS: Record<Exclude<Zona, "Lejos / otros">, string[]> = {
  "Barcelona": ["barcelona"],
  "L'Hospitalet y alrededores": [
    "l hospitalet de llobregat", "hospitalet de llobregat", "l hospitalet", "hospitalet", "esplugues de llobregat", "esplugues",
    "cornella de llobregat", "cornella", "sant joan despi", "sant just desvern",
  ],
  "Delta y Castelldefels": [
    "el prat de llobregat", "el prat", "prat de llobregat", "sant boi de llobregat", "sant boi", "viladecans", "gava",
    "castelldefels", "begues",
  ],
  "Baix Llobregat centro": [
    "sant feliu de llobregat", "molins de rei", "sant vicenc dels horts", "palleja", "cervello", "vallirana",
    "corbera de llobregat", "torrelles de llobregat", "el papiol", "sant andreu de la barca", "castellbisbal",
    "la palma de cervello", "santa coloma de cervello",
  ],
  "Baix Llobregat norte": [
    "martorell", "abrera", "olesa de montserrat", "esparreguera", "collbato", "sant esteve sesrovires",
    "castellvi de rosanes", "piera", "sant llorenc d hortons", "el bruc", "hostalets de pierola", "masquefa",
  ],
  "Garraf": [
    "cubelles", "vilanova i la geltru", "vilanova", "daltmar", "sant pere de ribes", "les roquetes", "sitges",
    "canyelles", "olivella", "cunit", "calafell", "el vendrell", "roda de bera", "bellvei",
  ],
  "Penedès": [
    "vilafranca del penedes", "olerdola", "santa margarida i els monjos", "la rapita", "mediona",
    "sant pere de riudebitlles", "sant sadurni d anoia", "avinyonet del penedes", "gelida", "sant marti sarroca",
    "torrelavit", "la granada", "castellet i la gornal",
  ],
};

const MAPA = new Map<string, Zona>();
(Object.entries(PUEBLOS) as [Zona, string[]][]).forEach(([zona, pueblos]) => pueblos.forEach((p) => MAPA.set(p, zona)));

/** Zona de una población; lo que no está en la tabla (o va vacío) cae en "Lejos / otros". */
export function zonaDe(poblacion: string | null | undefined): Zona {
  const limpia = normalizarNombre((poblacion ?? "").replace(/\(.*?\)/g, ""));
  return MAPA.get(limpia) ?? "Lejos / otros";
}
