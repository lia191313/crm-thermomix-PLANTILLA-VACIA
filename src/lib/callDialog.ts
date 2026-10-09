import { useEffect, useState } from "react";

export type MetodoLlamada = "pc" | "copiado" | "cancelado";

type CallDialogState = {
  telefono: string;
  resolve: (metodo: MetodoLlamada) => void;
} | null;

let currentState: CallDialogState = null;
let listeners: Array<(state: CallDialogState) => void> = [];

function setState(state: CallDialogState) {
  currentState = state;
  listeners.forEach((listener) => listener(state));
}

/**
 * Pide al usuario cómo quiere llamar: copiar el número para marcar desde el
 * móvil (lo habitual) o llamar desde este PC (dispara el enlace tel:, que
 * abre la app de llamadas del sistema, p. ej. Teléfono/Phone Link o Skype).
 * El <CallDialog /> montado en App.tsx resuelve la promesa.
 */
export function confirmarLlamada(telefono: string): Promise<MetodoLlamada> {
  return new Promise((resolve) => {
    setState({ telefono, resolve });
  });
}

export function useCallDialogState() {
  const [state, setLocalState] = useState(currentState);
  useEffect(() => {
    listeners.push(setLocalState);
    return () => {
      listeners = listeners.filter((listener) => listener !== setLocalState);
    };
  }, []);
  return state;
}

export function closeCallDialog(metodo: MetodoLlamada) {
  currentState?.resolve(metodo);
  setState(null);
}
