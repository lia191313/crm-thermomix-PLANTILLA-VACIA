import { useMemo, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingBag, Star, Phone, Heart } from "lucide-react";
import { TrendingUp as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import CualificacionTeamLeader from "@/components/CualificacionTeamLeader";
import { esContactoReal, esArchivado } from "@/lib/marcas";
import { useSupabaseVentas } from "@/hooks/useSupabaseVentas";
import { useDemos } from "@/hooks/useDemos";
import { useLlamadasGlobales } from "@/hooks/useLlamadasGlobales";
import { useContacts } from "@/hooks/useContacts";
import { fiscalMonthOf, fiscalMonthBounds, previousFiscalMonth, fiscalMonthLabel, isInFiscalMonth } from "@/utils/fiscalMonth";
import ContactadosDetailModal from "@/components/ContactadosDetailModal";

export default function Rendimiento() {
  const [showContactadosModal, setShowContactadosModal] = useState(false);
  const { ventas } = useSupabaseVentas();
  const { contacts } = useContacts();

  // Calcular stats desde ventas, usando MES FISCAL Thermomix.
  const statsVentas = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    const { start: inicioMes, endExclusive: inicioMesSiguiente } = fiscalMonthBounds(fmActual);

    const ventasMes = ventas.filter((v) => {
      const d = new Date(v.fecha_venta);
      return d >= inicioMes && d < inicioMesSiguiente;
    }).length;

    // Solo cuentan las bienvenidas con fecha DENTRO del mes fiscal actual.
    const bienvenidas_mes = ventas.filter((v) => {
      if (!v.bienvenida_realizada || !v.fecha_bienvenida) return false;
      const d = new Date(v.fecha_bienvenida);
      return d >= inicioMes && d < inicioMesSiguiente;
    }).length;

    return {
      ventasMes,
      bienvenidas_mes,
      totalVentas: ventas.length,
      demosMes: 0,
    };
  }, [ventas]);
  const { demos, stats: statsDemos } = useDemos();
  const { stats: statsLlamadas, contactos } = useLlamadasGlobales();

  // Últimos 6 meses fiscales - datos combinados.
  // Para cada uno de los 6 meses (5 anteriores al actual + el actual),
  // calculamos el rango fiscal y filtramos las colecciones por ese rango.
  const datosGrafica = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    // Construimos la lista de 6 meses fiscales en orden cronológico ascendente.
    const meses = [] as Array<{ year: number; month: number }>;
    let cursor = fmActual;
    // Empezamos por el actual y vamos hacia atrás 5 veces.
    for (let i = 0; i < 6; i++) {
      meses.unshift(cursor); // unshift para que queden en orden ascendente
      cursor = previousFiscalMonth(cursor);
    }

    return meses.map((fm) => {
      const { start, endExclusive } = fiscalMonthBounds(fm);
      const ventasMes = ventas.filter((v) => {
        const fv = new Date(v.fecha_venta);
        return fv >= start && fv < endExclusive;
      }).length;
      const demosMes = demos.filter((dm) => {
        const fd = new Date(dm.fecha);
        return fd >= start && fd < endExclusive;
      }).length;
      const contactosMes = contactos.filter((c) => {
        const fc = new Date(c.fecha);
        return fc >= start && fc < endExclusive && esContactoReal(c.tipo);
      }).length;
      const mesShort = fiscalMonthLabel(fm, { short: true });
      return {
        mes: mesShort.charAt(0).toUpperCase() + mesShort.slice(1),
        Ventas: ventasMes,
        Demos: demosMes,
        Contactos: contactosMes,
      };
    });
  }, [ventas, demos, contactos]);

  // Tasa de conversión demo → venta
  const tasaConversion = useMemo(() => {
    if (statsDemos.demosMes === 0) return null;
    return Math.round((statsVentas.ventasMes / statsDemos.demosMes) * 100);
  }, [statsVentas.ventasMes, statsDemos.demosMes]);

  // Etiqueta del mes fiscal actual, ej: "Mayo 2026".
  const mesActual = useMemo(
    () => fiscalMonthLabel(fiscalMonthOf(new Date())),
    []
  );

  // Crear mapa de contactos para búsqueda rápida
  const contactsMap = useMemo(() => {
    const map = new Map();
    contacts.forEach(c => map.set(c.id, c));
    return map;
  }, [contacts]);

  // Filtrar contactos UNICOS para el mes fiscal actual.
  // Solo cuentan interacciones reales (llamada, WhatsApp o difusión), no notas ni rellamar.
  const contactadosMes = useMemo(() => {
    const fmActual = fiscalMonthOf(new Date());
    const interaccionesMes = contactos.filter(c =>
      isInFiscalMonth(new Date(c.fecha), fmActual) &&
      esContactoReal(c.tipo) &&
      !esArchivado(contactsMap.get(c.contactoId)?.nombre ?? "") // sin los ⛔, como el Panel de control
    );

    // Agrupar por contactoId para obtener solo contactos unicos
    const contactosUnicos = Array.from(
      new Map(
        interaccionesMes.map((c) => [
          c.contactoId,
          c, // Guardar la interaccion mas reciente de cada contacto
        ])
      ).values()
    );

    return contactosUnicos;
  }, [contactos, contactsMap]);

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-5xl mx-auto">
      <CabeceraFormacion icono={IconoCabecera} titulo="Mi rendimiento" subtitulo={mesActual} />

      <CualificacionTeamLeader />

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-4 border-l-4 border-green-500">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={16} className="text-green-600" />
            <p className="text-xs text-muted-foreground uppercase font-medium">Ventas</p>
          </div>
          <p className="text-3xl font-bold text-green-600">{statsVentas.ventasMes}</p>
        </Card>

        <Card className="p-4 border-l-4 border-purple-500">
          <div className="flex items-center gap-2 mb-1">
            <Star size={16} className="text-purple-600" />
            <p className="text-xs text-muted-foreground uppercase font-medium">Demos</p>
          </div>
          <p className="text-3xl font-bold text-purple-600">{statsDemos.demosMes}</p>
          {statsDemos.demosMesAnterior > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {statsDemos.demosMes >= statsDemos.demosMesAnterior ? "▲" : "▼"} vs {statsDemos.demosMesAnterior} anterior
            </p>
          )}
        </Card>

        <Card className="p-4 border-l-4 border-blue-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowContactadosModal(true)}>
          <div className="flex items-center gap-2 mb-1">
            <Phone size={16} className="text-blue-600" />
            <p className="text-xs text-muted-foreground uppercase font-medium">Contactos</p>
          </div>
          <p className="text-3xl font-bold text-blue-600">{contactadosMes.length}</p>
          <p className="text-xs text-muted-foreground mt-1">este mes</p>
        </Card>

        <Card className="p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-amber-600" />
            <p className="text-xs text-muted-foreground uppercase font-medium">Conversión</p>
          </div>
          {tasaConversion !== null ? (
            <>
              <p className="text-3xl font-bold text-amber-600">{tasaConversion}%</p>
              <p className="text-xs text-muted-foreground mt-1">demo → venta</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">Sin demos este mes</p>
          )}
        </Card>

        <Card className="p-4 border-l-4 border-pink-500">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={16} className="text-pink-600" />
            <p className="text-xs text-muted-foreground uppercase font-medium">Bienvenidas</p>
          </div>
          <p className="text-3xl font-bold text-pink-600">{statsVentas.bienvenidas_mes}</p>
          <p className="text-xs text-muted-foreground mt-1">hechas este mes</p>
          {ventas
            .filter((v) => v.bienvenida_realizada === false)
            .sort((a, b) => (a.fecha_bienvenida ?? "9").localeCompare(b.fecha_bienvenida ?? "9"))
            .map((v) => (
              <p key={v.id} className="text-xs text-pink-700 mt-1">
                ⏳ {(v.contacto_nombre ?? "").split(" ")[0]}
                {v.fecha_bienvenida
                  ? ` · ${new Date(`${v.fecha_bienvenida.slice(0, 10)}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "numeric" })}`
                  : " · sin fecha"}
              </p>
            ))}
        </Card>
      </div>

      {/* Gráfica de barras - ventas y demos por mes */}
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Ventas y demos — últimos 6 meses</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={datosGrafica} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Ventas" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Demos" fill="#a855f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Gráfica de línea - contactos por mes */}
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Actividad de contactos — últimos 6 meses</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={datosGrafica} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="Contactos"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Resumen textual */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <h2 className="font-bold text-lg mb-3">Resumen del mes</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Has realizado <span className="font-bold text-foreground">{statsDemos.demosMes} demos</span> este mes.</li>
          <li>• Has cerrado <span className="font-bold text-foreground">{statsVentas.ventasMes} ventas</span> de TM7.</li>
          <li>• Tienes <span className="font-bold text-orange-600">{ventas.filter(v => v.bienvenida_realizada === false).length} bienvenidas pendientes</span> de realizar.</li>
          <li>• Has contactado con <span className="font-bold text-foreground">{statsLlamadas.mes} clientes</span> este mes (llamadas + WhatsApp).</li>
          {tasaConversion !== null && (
            <li>• Tu tasa de conversión demo → venta es del <span className="font-bold text-green-600">{tasaConversion}%</span>.</li>
          )}
        </ul>
      </Card>

      {/* Modal de Detalle de Contactados */}
      {showContactadosModal && (
        <ContactadosDetailModal
          isOpen={showContactadosModal}
          onClose={() => setShowContactadosModal(false)}
          title="Contactos de este mes"
          contactos={contactadosMes}
          contactsMap={contactsMap}
        />
      )}
    </div>
  );
}
