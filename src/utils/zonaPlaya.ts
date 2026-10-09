// "Mi zona": pueblos que cuentan como tu zona (internamente se llama
// zona_playa). Puedes añadir aquí los tuyos, por ejemplo: "Sabadell", "Terrassa".
// Si la lista está vacía, la zona se marca a mano en la ficha de cada contacto.
export const MUNICIPIOS_ZONA_PLAYA: string[] = [];

export const isZonaPlaya = (ubicacion: string): boolean => {
  if (!ubicacion) return false;
  return MUNICIPIOS_ZONA_PLAYA.some(municipio =>
    ubicacion.toLowerCase().includes(municipio.toLowerCase())
  );
};

export const getZonaPlayaLabel = (zonaPlaya: boolean): string => {
  return zonaPlaya ? "📍 Mi zona" : "";
};
