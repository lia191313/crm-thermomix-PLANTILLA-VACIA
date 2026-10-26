import { Users, BarChart3, MessageSquare, Clock, Calendar, ShoppingBag, TrendingUp, FileText, ClipboardList, UsersRound, CalendarDays, Sun, Filter, Gift, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Menú de la app agrupado por temas (21/10/2026). Lo usan el menú lateral del
// ordenador (Sidebar) y el "Más" del móvil (MobileNav).

export interface ItemMenu {
  id: string;
  label: string;
  /** Nombre corto para la barra de abajo del móvil. */
  corto?: string;
  icon: LucideIcon;
}

export const GRUPOS_MENU: { titulo: string; items: ItemMenu[] }[] = [
  {
    titulo: "Hoy",
    items: [
      { id: "mi-dia", label: "Mi día", icon: Sun },
      { id: "calendario", label: "Calendario", icon: CalendarDays },
      { id: "recordatorios", label: "Recordatorios", icon: Clock },
      { id: "promociones", label: "Promociones", icon: Gift },
    ],
  },
  {
    titulo: "Clientas",
    items: [
      { id: "contactos", label: "Contactos", icon: Users },
      { id: "embudo", label: "Embudo", icon: Filter },
      { id: "listados", label: "Listados", icon: ClipboardList },
    ],
  },
  {
    titulo: "Ventas y resultados",
    items: [
      { id: "ventas", label: "Ventas y bienvenidas", corto: "Ventas", icon: ShoppingBag },
      { id: "rendimiento", label: "Mi rendimiento", icon: TrendingUp },
      { id: "dashboard", label: "Panel de control", icon: BarChart3 },
      { id: "reporte-diario", label: "Reporte diario", icon: FileText },
      { id: "comisiones", label: "Mis comisiones", icon: Receipt },
    ],
  },
  {
    titulo: "Equipo y herramientas",
    items: [
      { id: "equipo", label: "Equipo", icon: UsersRound },
      { id: "planning", label: "Planning mensual", icon: Calendar },
      { id: "plantillas", label: "Plantillas", icon: MessageSquare },
    ],
  },
];

/** Los 4 que van siempre a la vista en la barra de abajo del móvil (el 5º es "Más"). */
export const BARRA_MOVIL = ["mi-dia", "calendario", "contactos", "embudo"];

export const ITEMS_MENU = GRUPOS_MENU.flatMap((g) => g.items);
