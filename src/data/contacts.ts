export interface Contact {
  id: number;
  nombre: string;
  telefono: string;
  notas: string;
  modelo: string;
  ubicacion: string;
  ultimoContacto: string | null;
  intereses: string[];
  estado?: "pendiente" | "contactado" | "rellamar";
  zonaPlaya?: boolean;
  sinContactar?: boolean;
  recibeDifusion?: boolean;
  origen?: string | null;
  estado_lead?: string | null;
}

export const contacts: Contact[] = [];
