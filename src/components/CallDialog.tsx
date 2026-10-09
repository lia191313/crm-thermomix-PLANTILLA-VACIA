import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { useCallDialogState, closeCallDialog } from "@/lib/callDialog";

/**
 * Diálogo global (montado una vez en App.tsx) que se abre cada vez que se
 * pide confirmarLlamada(telefono). En PC, un enlace tel: normal lo captura
 * la app de llamadas del sistema (Teléfono/Phone Link, Skype...), así que
 * por defecto ofrecemos copiar el número para marcarlo desde el móvil, y
 * dejamos "Llamar desde este PC" como opción explícita para quien sí quiera
 * usar esa app puntualmente.
 */
export default function CallDialog() {
  const state = useCallDialogState();
  const telefono = state?.telefono ?? "";

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(telefono.replace(/\D/g, ""));
      toast.success("Número copiado. Ya puedes marcarlo desde tu móvil.");
    } catch {
      toast.error("No se pudo copiar el número");
    }
    closeCallDialog("copiado");
  };

  const handleLlamarPC = () => {
    window.location.href = `tel:${telefono.replace(/\D/g, "")}`;
    closeCallDialog("pc");
  };

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && closeCallDialog("cancelado")}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Llamar a {telefono}</DialogTitle>
          <DialogDescription>Elige cómo quieres hacer la llamada</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleCopiar} className="gap-2 justify-start">
            <Copy className="w-4 h-4" />
            Copiar número (llamar desde el móvil)
          </Button>
          <Button onClick={handleLlamarPC} variant="outline" className="gap-2 justify-start">
            <PhoneCall className="w-4 h-4" />
            Llamar desde este PC
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
