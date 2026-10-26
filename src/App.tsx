import { Toaster } from "sonner";
import CallDialog from "./components/CallDialog";
import RecordatoriosPopup from "./components/RecordatoriosPopup";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import DashboardNew from "./pages/DashboardNew";
import { cargarConReintento, vigilarNuevaVersion } from "./lib/actualizaciones";

// El resto de pantallas se descargan solo al entrar en ellas: así la app
// arranca antes (sobre todo en el móvil) en vez de bajarse todo de golpe.
const ContactosNew = lazy(cargarConReintento(() => import("./pages/ContactosNew")));
const HistorialNew = lazy(cargarConReintento(() => import("./pages/HistorialNew")));
const Plantillas = lazy(cargarConReintento(() => import("./pages/Plantillas")));
const DetalleContacto = lazy(cargarConReintento(() => import("./pages/DetalleContacto")));
const Recordatorios = lazy(cargarConReintento(() => import("./pages/Recordatorios")));
const PlanningMensual = lazy(cargarConReintento(() => import("./pages/PlanningMensual")));
const HistorialContactos = lazy(cargarConReintento(() => import("./pages/HistorialContactos")));
const Ventas = lazy(cargarConReintento(() => import("./pages/Ventas")));
const Rendimiento = lazy(cargarConReintento(() => import("./pages/Rendimiento")));
const ReporteDiario = lazy(cargarConReintento(() => import("./pages/ReporteDiario")));
const Equipo = lazy(cargarConReintento(() => import("./pages/Equipo")));
const Listados = lazy(cargarConReintento(() => import("./pages/Listados")));
const Calendario = lazy(cargarConReintento(() => import("./pages/Calendario")));
const MiDia = lazy(cargarConReintento(() => import("./pages/MiDia")));
const Embudo = lazy(cargarConReintento(() => import("./pages/Embudo")));
const Promociones = lazy(cargarConReintento(() => import("./pages/Promociones")));
const Comisiones = lazy(cargarConReintento(() => import("./pages/Comisiones")));
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { loadRemindersFromSupabase } from "./hooks/useReminders";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

// Lista de secciones válidas que pueden venir por query string desde una
// notificación push. Si llega cualquier otra cosa, la ignoramos por seguridad.
const VALID_SECTIONS = new Set([
  "dashboard",
  "contactos",
  "ventas",
  "rendimiento",
  "historial",
  "plantillas",
  "recordatorios",
  "planning",
  "historial-contactos",
  "reporte-diario",
  "equipo",
  "listados",
  "calendario",
  "mi-dia",
  "embudo",
  "promociones",
  "comisiones",
]);

// La app se abre en "Mi día" (21/10/2026; antes en el Dashboard).
const PANTALLA_INICIAL = "mi-dia";

// Sección inicial: si la app se abre con ?section=XXX (típicamente desde
// una notificación push), arrancamos directamente en esa sección en vez
// del dashboard. Limpiamos los query params después para no repetir el
// salto si el usuario refresca.
function getInitialSectionFromUrl(): string {
  if (typeof window === "undefined") return PANTALLA_INICIAL;
  try {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section && VALID_SECTIONS.has(section)) {
      // Limpiamos la URL para que un refresh no vuelva a forzar la sección.
      window.history.replaceState({}, "", window.location.pathname);
      return section;
    }
  } catch (_e) {
    // Si algo va mal parseando, simplemente caemos al default.
  }
  return PANTALLA_INICIAL;
}

function App() {
  const { user, loading, isPasswordRecovery, signOut } = useSupabaseAuth();
  const [activeSection, setActiveSection] = useState<string>(getInitialSectionFromUrl);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [activeSection, selectedContactId]);

  // Botón "atrás" (sobre todo el del móvil): cada pantalla y cada ficha se
  // apuntan en el historial del navegador, así "atrás" vuelve a la anterior
  // en vez de cerrar la app.
  const navegar = useCallback((section: string) => {
    setSelectedContactId(null);
    setActiveSection(section);
    window.history.pushState({ section, contactId: null }, "");
  }, []);

  const verContacto = useCallback((contactId: number) => {
    setSelectedContactId(contactId);
    window.history.pushState({ section: window.history.state?.section ?? PANTALLA_INICIAL, contactId }, "");
  }, []);

  const cerrarContacto = useCallback(() => {
    // Si la ficha se abrió con verContacto, volver es lo mismo que "atrás".
    if (window.history.state?.contactId != null) window.history.back();
    else setSelectedContactId(null);
  }, []);

  useEffect(() => {
    window.history.replaceState({ section: activeSection, contactId: null }, "");
    const alVolverAtras = (event: PopStateEvent) => {
      const estado = event.state as { section?: string; contactId?: number | null } | null;
      setActiveSection(estado?.section && VALID_SECTIONS.has(estado.section) ? estado.section : PANTALLA_INICIAL);
      setSelectedContactId(estado?.contactId ?? null);
    };
    window.addEventListener("popstate", alVolverAtras);
    return () => window.removeEventListener("popstate", alVolverAtras);
    // Solo al arrancar: la primera entrada del historial es la pantalla inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avisar si se publica una versión nueva mientras la app está abierta.
  useEffect(() => {
    vigilarNuevaVersion();
  }, []);

  // Escuchar mensajes del service worker (clic en notificación push con la
  // app YA abierta). El SW nos manda { type: 'navigate', section, ... } para
  // que cambiemos de sección sin recargar la página.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      // navigate: el SW pide cambiar de sección al pulsar la notificación.
      if (data.type === "navigate") {
        if (typeof data.section === "string" && VALID_SECTIONS.has(data.section)) {
          // Si estábamos viendo el detalle de un contacto, lo cerramos para
          // que se vea la nueva sección.
          navegar(data.section);
        }
        return;
      }
      // reminder-snoozed: el SW acaba de posponer un recordatorio desde la
      // notificación push. Refrescamos los recordatorios desde BD para que
      // la nueva fecha se vea en la app sin tener que pulsar F5.
      if (data.type === "reminder-snoozed") {
        loadRemindersFromSupabase().catch((e) =>
          console.error("Error refrescando recordatorios tras snooze:", e)
        );
        return;
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  // Se comprueba antes que `!user`: al volver del enlace de recuperación,
  // Supabase ya crea una sesión temporal (user != null), pero queremos que
  // primero se ponga la contraseña nueva en vez de entrar directo a la app.
  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  if (!user) {
    return <Login onLoginSuccess={() => setActiveSection(PANTALLA_INICIAL)} />;
  }

  const renderContent = () => {
    if (selectedContactId !== null) {
      return (
        <DetalleContacto
          contactId={selectedContactId}
          onBack={cerrarContacto}
        />
      );
    }

    switch (activeSection) {
      case "dashboard":
        return <DashboardNew onViewContact={verContacto} onNavigate={navegar} />;
      case "contactos":
        return <ContactosNew onViewContact={verContacto} />;
      case "ventas":
        return <Ventas />;
      case "rendimiento":
        return <Rendimiento />;
      case "historial":
        return <HistorialNew />;
      case "plantillas":
        return <Plantillas />;
      case "recordatorios":
        return <Recordatorios onViewContact={verContacto} />;
      case "planning":
        return <PlanningMensual onViewContact={verContacto} />;
      case "historial-contactos":
        return <HistorialContactos />;
      case "reporte-diario":
        return <ReporteDiario onViewContact={verContacto} />;
      case "equipo":
        return <Equipo />;
      case "listados":
        return <Listados />;
      case "mi-dia":
        return <MiDia onViewContact={verContacto} onNavigate={navegar} />;
      case "embudo":
        return <Embudo onViewContact={verContacto} />;
      case "promociones":
        return <Promociones />;
      case "comisiones":
        return <Comisiones />;
      case "calendario":
        return <Calendario onViewContact={verContacto} />;
      default:
        return <DashboardNew onViewContact={verContacto} onNavigate={navegar} />;
    }
  };

  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster position="top-center" richColors />
        <CallDialog />
        {user && <RecordatoriosPopup onVerTodos={() => navegar("recordatorios")} />}
        <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
          {selectedContactId === null && (
            <div className="hidden md:block w-64 border-r border-sidebar-border h-screen sticky top-0">
              <Sidebar activeSection={activeSection} onNavigate={navegar} onSignOut={signOut} />
            </div>
          )}
          <main className="flex-1 overflow-y-auto w-full pb-20 md:pb-0">
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </main>
        </div>
        {selectedContactId === null && (
          <MobileNav activeSection={activeSection} onNavigate={navegar} />
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
