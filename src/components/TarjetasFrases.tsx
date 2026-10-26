import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, Pause, Play } from "lucide-react";
import { TMX } from "@/components/EstiloFormacion";
import { FRASES_LLAMADAS } from "@/lib/frasesLlamadas";

// Ideas de frases para las llamadas, en una tarjeta que cambia sola cada pocos
// segundos (22/10/2026). Con las flechas se pasan a mano; al tocar pausa se queda quieta.

const SEGUNDOS = 20;

export default function TarjetasFrases() {
  const total = FRASES_LLAMADAS.length;
  // Empieza siempre por la presentación: las frases siguen el orden de la llamada.
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);

  useEffect(() => {
    if (pausa) return;
    const t = setInterval(() => setI((n) => (n + 1) % total), SEGUNDOS * 1000);
    return () => clearInterval(t);
  }, [pausa, total]);

  const mover = (paso: number) => setI((n) => (n + paso + total) % total);
  const frase = FRASES_LLAMADAS[i];

  return (
    <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: TMX.verde }}>
      <div className="flex items-start gap-3">
        <Lightbulb size={36} strokeWidth={1.5} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Idea para tus llamadas · {frase.momento}</p>
          <p key={i} className="mt-1 min-h-[3.5rem] text-lg font-medium leading-snug animate-in fade-in duration-500">«{frase.texto}»</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs opacity-80 tabular-nums">{i + 1} de {total}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} className="rounded-full p-1.5 hover:bg-white/20" title="Anterior"><ChevronLeft size={20} /></button>
          <button onClick={() => setPausa((p) => !p)} className="rounded-full p-1.5 hover:bg-white/20" title={pausa ? "Seguir cambiando" : "Parar aquí"}>
            {pausa ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={() => mover(1)} className="rounded-full p-1.5 hover:bg-white/20" title="Siguiente"><ChevronRight size={20} /></button>
        </div>
      </div>
    </div>
  );
}
