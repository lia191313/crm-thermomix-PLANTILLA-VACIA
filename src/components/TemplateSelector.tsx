import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Image as ImageIcon, Copy, CheckCircle } from "lucide-react";
import { MessageTemplate } from "@/services/storage";
import { useTemplates } from "@/hooks/useTemplates";
import { toast } from "sonner";

interface TemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  contactPhone: string;
  contactModel?: string;
  onSendViaWhatsApp: (message: string, imageData?: string) => void;
}

export default function TemplateSelector({
  open,
  onOpenChange,
  contactName,
  contactPhone,
  contactModel,
  onSendViaWhatsApp,
}: TemplateSelectorProps) {
  const { templates, renderTemplate } = useTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSelectTemplate = (template: MessageTemplate) => {
    const variables = {
      nombre: contactName.split(" ")[0],
      modelo: contactModel || "Thermomix",
      receta: "Receta Especial",
    };
    const renderedContent = renderTemplate(template, variables);
    setCustomMessage(renderedContent);
    setSelectedTemplate(template);
  };

  const handleSendMessage = () => {
    if (!customMessage.trim()) {
      toast.error("El mensaje no puede estar vacío");
      return;
    }

    onSendViaWhatsApp(customMessage, selectedTemplate?.imageData);
    setSelectedTemplate(null);
    setCustomMessage("");
    onOpenChange(false);
    toast.success("Mensaje enviado por WhatsApp");
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(customMessage);
    setCopied(true);
    toast.success("Mensaje copiado al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Plantilla a {contactName}</DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecciona una plantilla para enviar a través de WhatsApp
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className="p-3 cursor-pointer hover:border-primary hover:shadow-md transition-all"
                  onClick={() => handleSelectTemplate(template)}
                >
                  {template.imageData && (
                    <div className="mb-2 rounded h-20 bg-gray-100 overflow-hidden">
                      <img
                        src={template.imageData}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <h4 className="font-semibold text-sm text-foreground mb-1">
                    {template.name}
                  </h4>
                  {template.imageData && (
                    <div className="flex items-center gap-1 mb-2 text-xs text-blue-600">
                      <ImageIcon className="w-3 h-3" />
                      <span>Con imagen</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.content}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                Plantilla: {selectedTemplate.name}
              </h3>

              {selectedTemplate.imageData && (
                <div className="mb-4 rounded-lg overflow-hidden h-40 bg-gray-100">
                  <img
                    src={selectedTemplate.imageData}
                    alt={selectedTemplate.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <label className="text-sm font-medium block mb-2">
                Mensaje a enviar:
              </label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={6}
                className="resize-none"
              />

              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyMessage}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (selectedTemplate) {
                setSelectedTemplate(null);
                setCustomMessage("");
              } else {
                onOpenChange(false);
              }
            }}
          >
            {selectedTemplate ? "Volver" : "Cancelar"}
          </Button>

          {selectedTemplate && (
            <Button
              onClick={handleSendMessage}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Enviar por WhatsApp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
