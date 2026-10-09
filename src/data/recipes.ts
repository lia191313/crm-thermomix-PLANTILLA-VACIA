export interface Recipe {
  id: number;
  nombre: string;
  categoria: string;
  tiempo: string;
  puntuacion: number;
  imagen: string;
  descripcion: string;
  enlaceCookidoo?: string;
  dificultad?: "fácil" | "media" | "difícil";
  raciones?: string;
  ingredientes?: string[];
}

export const recipes: Recipe[] = [];
