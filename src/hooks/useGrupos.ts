import { useState, useEffect, useCallback, useMemo } from "react";

// Grupos predefinidos para arrancar + los que añada el usuario
const GRUPOS_DEFAULT = ["Mi zona", "Otra zona", "Online", "Otros"];
const STORAGE_GRUPOS = "thermomix_grupos";
const STORAGE_ASIGNACIONES = "thermomix_grupos_asignaciones";

export function useGrupos() {
  const [grupos, setGrupos] = useState<string[]>(GRUPOS_DEFAULT);
  // asignaciones: { contactoId: string[] }
  const [asignaciones, setAsignaciones] = useState<Record<number, string[]>>({});

  useEffect(() => {
    const g = localStorage.getItem(STORAGE_GRUPOS);
    if (g) {
      try { setGrupos(JSON.parse(g)); } catch {}
    }
    const a = localStorage.getItem(STORAGE_ASIGNACIONES);
    if (a) {
      try { setAsignaciones(JSON.parse(a)); } catch {}
    }
  }, []);

  const saveGrupos = (updated: string[]) => {
    setGrupos(updated);
    localStorage.setItem(STORAGE_GRUPOS, JSON.stringify(updated));
  };

  const saveAsignaciones = (updated: Record<number, string[]>) => {
    setAsignaciones(updated);
    localStorage.setItem(STORAGE_ASIGNACIONES, JSON.stringify(updated));
  };

  const addGrupo = useCallback((nombre: string) => {
    const trimmed = nombre.trim();
    if (!trimmed || grupos.includes(trimmed)) return false;
    saveGrupos([...grupos, trimmed]);
    return true;
  }, [grupos]);

  const deleteGrupo = useCallback((nombre: string) => {
    saveGrupos(grupos.filter(g => g !== nombre));
    // Quitar el grupo de todas las asignaciones
    const updated: Record<number, string[]> = {};
    Object.entries(asignaciones).forEach(([id, gs]) => {
      updated[Number(id)] = gs.filter(g => g !== nombre);
    });
    saveAsignaciones(updated);
  }, [grupos, asignaciones]);

  const getGruposContacto = useCallback((contactoId: number): string[] => {
    return asignaciones[contactoId] || [];
  }, [asignaciones]);

  const setGruposContacto = useCallback((contactoId: number, grupos: string[]) => {
    const updated = { ...asignaciones, [contactoId]: grupos };
    saveAsignaciones(updated);
  }, [asignaciones]);

  const toggleGrupoContacto = useCallback((contactoId: number, grupo: string) => {
    const actuales = asignaciones[contactoId] || [];
    const nuevos = actuales.includes(grupo)
      ? actuales.filter(g => g !== grupo)
      : [...actuales, grupo];
    saveAsignaciones({ ...asignaciones, [contactoId]: nuevos });
  }, [asignaciones]);

  const getContactosPorGrupo = useCallback((grupo: string): number[] => {
    return Object.entries(asignaciones)
      .filter(([, gs]) => gs.includes(grupo))
      .map(([id]) => Number(id));
  }, [asignaciones]);

  const totalPorGrupo = useMemo(() => {
    const counts: Record<string, number> = {};
    grupos.forEach(g => { counts[g] = 0; });
    Object.values(asignaciones).forEach(gs => {
      gs.forEach(g => { if (counts[g] !== undefined) counts[g]++; });
    });
    return counts;
  }, [grupos, asignaciones]);

  return {
    grupos,
    addGrupo,
    deleteGrupo,
    getGruposContacto,
    setGruposContacto,
    toggleGrupoContacto,
    getContactosPorGrupo,
    totalPorGrupo,
  };
}
