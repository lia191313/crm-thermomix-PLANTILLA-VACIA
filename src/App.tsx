import { Toaster } from "sonner";
import CallDialog from "./components/CallDialog";
import RecordatoriosPopup from "./components/RecordatoriosPopup";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect, lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import DashboardNew from "./pages/DashboardNew";
import { cargarConReintento, vigilarNuevaVersion } from "./lib/actualizaciones";

// El resto de pantallas se descargan solo al entrar en ellas: así la app
// arranca antes (sobre todo en el móvil) en vez de bajarse todo de golpe.
const ContactosNew = lazy(cargarConReintento(() => import("./pages/ContactosNew")));
const RecetasSimple = lazy(cargarConReintento(() => import("./pages/RecetasSimple")));
const HistorialNew = lazy(cargarConReintento(() => import("./pages/HistorialNew")));
const Plantillas = lazy(cargarConReintento(() => import("./pages/Plantillas")));
const DetalleContacto = lazy(cargarConReintento(() => import("./pages/DetalleContacto")));
const Recordatorios = lazy(cargarConReintento(() => import("./pages/Recordatorios")));
const PlanningMensual = lazy(cargarConReintento(() => import("./pages/PlanningMensual")));
const HistorialContactos = lazy(cargarConReintento(() => import("./pages/HistorialContactos")));
const Ventas = lazy(cargarConReintento(() => import("./pages/Ventas")));
const Rendimiento = lazy(cargarConReintento(() => import("./pages/Rendimiento")));
const ReporteDiario = lazy(cargarConReintento(() => import("./pages/ReporteDiario")));
const LeadsRedes = lazy(cargarConReintento(() => import("./pages/LeadsRedes")));
const Listados = lazy(cargarConReintento(() => import("./pages/Listados")));
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
  "recetas",
  "historial",
  "plantillas",
  "recordatorios",
  "planning",
  "historial-contactos",
  "reporte-diario",
  "leads-redes",
  "listados",
]);

// Sección inicial: si la app se abre con ?section=XXX (típicamente desde
// una notificación push), arrancamos directamente en esa sección en vez
// del dashboard. Limpiamos los query params después para no repetir el
// salto si el usuario refresca.
function getInitialSectionFromUrl(): string {
  if (typeof window === "undefined") return "dashboard";
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
  return "dashboard";
}

function App() {
  const { user, loading, isPasswordRecovery, signOut } = useSupabaseAuth();
  const [activeSection, setActiveSection] = useState<string>(getInitialSectionFromUrl);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [activeSection, selectedContactId]);

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
          setSelectedContactId(null);
          setActiveSection(data.section);
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
    return <Login onLoginSuccess={() => setActiveSection("dashboard")} />;
  }

  const renderContent = () => {
    if (selectedContactId !== null) {
      return (
        <DetalleContacto
          contactId={selectedContactId}
          onBack={() => setSelectedContactId(null)}
        />
      );
    }

    switch (activeSection) {
      case "dashboard":
        return <DashboardNew onViewContact={setSelectedContactId} onNavigate={setActiveSection} />;
      case "contactos":
        return <ContactosNew onViewContact={setSelectedContactId} />;
      case "ventas":
        return <Ventas />;
      case "rendimiento":
        return <Rendimiento />;
      case "recetas":
        return <RecetasSimple />;
      case "historial":
        return <HistorialNew />;
      case "plantillas":
        return <Plantillas />;
      case "recordatorios":
        return <Recordatorios onViewContact={setSelectedContactId} />;
      case "planning":
        return <PlanningMensual onViewContact={setSelectedContactId} />;
      case "historial-contactos":
        return <HistorialContactos />;
      case "reporte-diario":
        return <ReporteDiario onViewContact={setSelectedContactId} />;
      case "leads-redes":
        return <LeadsRedes />;
      case "listados":
        return <Listados />;
      default:
        return <DashboardNew onViewContact={setSelectedContactId} onNavigate={setActiveSection} />;
    }
  };

  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster position="top-center" richColors />
        <CallDialog />
        {user && <RecordatoriosPopup onVerTodos={() => setActiveSection("recordatorios")} />}
        <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
          {selectedContactId === null && (
            <div className="hidden md:block w-64 border-r border-sidebar-border h-screen sticky top-0">
              <Sidebar activeSection={activeSection} onNavigate={setActiveSection} />
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
          <MobileNav activeSection={activeSection} onNavigate={setActiveSection} />
        )}
        {user && (
          <button
            onClick={() => signOut()}
            className="fixed bottom-4 right-4 p-2 text-xs bg-destructive text-destructive-foreground rounded opacity-50 hover:opacity-100 transition-opacity hidden md:block z-50"
            title="Cerrar sesión"
          >
            Salir
          </button>
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
