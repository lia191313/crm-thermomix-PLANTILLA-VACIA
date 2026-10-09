import { useState, useEffect, useCallback, useMemo } from "react";

export interface Venta {
  id: string;
  contactoId: number;
  contactoNombre: string;
  contactoTelefono: string;
  contactoUbicacion: string;
  modelo: string;
  fechaVenta: string; // ISO date
  fechaBienvenida: string | null; // ISO date, null = pendiente de asignar
  bienvenidaRealizada: boolean;
  notas: string;
}

const STORAGE_KEY = "thermomix_ventas";

export function useVentas() {
  const [ventas, setVentas] = useState<Venta[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setVentas(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing ventas", e);
      }
    }
  }, []);

  const save = (updated: Venta[]) => {
    setVentas(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addVenta = useCallback(
    (data: Omit<Venta, "id">) => {
      const newVenta: Venta = { ...data, id: Date.now().toString() };
      save([...ventas, newVenta]);
      return newVenta;
    },
    [ventas]
  );

  const updateVenta = useCallback(
    (id: string, updates: Partial<Venta>) => {
      save(ventas.map((v) => (v.id === id ? { ...v, ...updates } : v)));
    },
    [ventas]
  );

  const deleteVenta = useCallback(
    (id: string) => {
      save(ventas.filter((v) => v.id !== id));
    },
    [ventas]
  );

  const marcarBienvenidaRealizada = useCallback(
    (id: string) => {
      save(
        ventas.map((v) =>
          v.id === id ? { ...v, bienvenidaRealizada: true } : v
        )
      );
    },
    [ventas]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0);

    const ventasMes = ventas.filter(
      (v) => new Date(v.fechaVenta) >= inicioMes
    ).length;

    const ventasMesAnterior = ventas.filter((v) => {
      const d = new Date(v.fechaVenta);
      return d >= inicioMesAnterior && d <= finMesAnterior;
    }).length;

    const bienvenidsPendientes = ventas.filter(
      (v) => !v.bienvenidaRealizada
    );

    const bienvendidasMes = ventas.filter(
      (v) =>
        v.bienvenidaRealizada &&
        v.fechaBienvenida &&
        new Date(v.fechaBienvenida) >= inicioMes
    ).length;

    return {
      ventasMes,
      ventasMesAnterior,
      bienvenidsPendientes,
      bienvendidasMes,
      totalVentas: ventas.length,
    };
  }, [ventas]);

  const getVentasPorContacto = useCallback(
    (contactoId: number) => ventas.filter((v) => v.contactoId === contactoId),
    [ventas]
  );

  return {
    ventas,
    addVenta,
    updateVenta,
    deleteVenta,
    marcarBienvenidaRealizada,
    stats,
    getVentasPorContacto,
  };
}
