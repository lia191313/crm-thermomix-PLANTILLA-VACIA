import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "thermomix_prioritarios";

export function usePrioritarios() {
  const [prioritarios, setPrioritarios] = useState<number[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setPrioritarios(JSON.parse(stored)); } catch {}
    }
  }, []);

  const save = (updated: number[]) => {
    setPrioritarios(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const esPrioritario = useCallback(
    (contactoId: number) => prioritarios.includes(contactoId),
    [prioritarios]
  );

  const togglePrioritario = useCallback(
    (contactoId: number) => {
      if (prioritarios.includes(contactoId)) {
        save(prioritarios.filter(id => id !== contactoId));
      } else {
        save([...prioritarios, contactoId]);
      }
    },
    [prioritarios]
  );

  const setPrioritariosList = useCallback(
    (ids: number[]) => save(ids),
    []
  );

  return { prioritarios, esPrioritario, togglePrioritario, setPrioritariosList };
}
