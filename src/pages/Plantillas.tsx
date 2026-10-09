import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Copy, CheckCircle, Image as ImageIcon } from "lucide-react";
import { useTemplates } from "@/hooks/useTemplates";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

export default function Plantillas() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | undefined>();
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImageData, setFormImageData] = useState<string | undefined>();
  const [formImageName, setFormImageName] = useState<string | undefined>();
  const [copied, setCopied] = useState<string | null>(null);

  const handleOpenDialog = (template?: typeof templates[0]) => {
    if (template) {
      setSelectedTemplate(template);
      setFormName(template.name);
      setFormContent(template.content);
      setFormImageData(template.imageData);
      setFormImageName(template.imageName);
    } else {
      setSelectedTemplate(undefined);
      setFormName("");
      setFormContent("");
      setFormImageData(undefined);
      setFormImageName(undefined);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formContent.trim()) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    try {
      if (selectedTemplate) {
        await updateTemplate({
          ...selectedTemplate,
          name: formName,
          content: formContent,
          imageData: formImageData,
          imageName: formImageName,
        });
        toast.success("Plantilla actualizada correctamente");
      } else {
        await addTemplate(formName, formContent, formImageData, formImageName);
        toast.success("Plantilla creada correctamente");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error("Error al guardar la plantilla");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta plantilla?")) {
      try {
        await deleteTemplate(id);
        toast.success("Plantilla eliminada correctamente");
      } catch (error) {
        toast.error("Error al eliminar la plantilla");
      }
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    toast.success("Plantilla copiada al portapapeles");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Plantillas de Mensajes</h1>
          <p className="text-muted-foreground mt-1">
            Crea y gestiona tus plantillas personalizadas con imágenes
          </p>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="w-full md:w-auto bg-primary hover:bg-primary/90 gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Plantilla
        </Button>
      </div>

      {/* Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> Usa variables como {"{nombre}"}, {"{modelo}"}, {"{receta}"} en tus plantillas. Se reemplazarán automáticamente cuando las uses. ¡Ahora puedes agregar imágenes a tus plantillas!
        </p>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="p-4 flex flex-col">
            {template.imageData && (
              <div className="mb-4 rounded-lg overflow-hidden h-32 bg-gray-100">
                <img
                  src={template.imageData}
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1">
              <h3 className="font-bold text-foreground mb-2">{template.name}</h3>
              {template.imageData && (
                <div className="flex items-center gap-1 mb-2 text-xs text-blue-600">
                  <ImageIcon className="w-3 h-3" />
                  <span>Incluye imagen</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                {template.content}
              </p>
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t flex-wrap">
              <button
                onClick={() => handleCopy(template.content, template.id)}
                className="flex-1 min-w-[80px] p-2 bg-blue-100 hover:bg-blue-200 rounded transition flex items-center justify-center gap-2"
              >
                {copied === template.id ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span className="text-sm">Copiar</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleOpenDialog(template)}
                className="flex-1 min-w-[80px] p-2 bg-green-100 hover:bg-green-200 rounded transition flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4" />
                <span className="text-sm">Editar</span>
              </button>
              {!template.id.startsWith("default-") && (
                <button
                  onClick={() => handleDelete(template.id)}
                  className="flex-1 min-w-[80px] p-2 bg-red-100 hover:bg-red-200 rounded transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm">Eliminar</span>
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Receta Sugerida"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Contenido</label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Escribe tu plantilla aquí. Usa {nombre}, {modelo}, {receta} para variables."
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Variables disponibles: {"{nombre}"}, {"{modelo}"}, {"{receta}"}
              </p>
            </div>

            <ImageUploader
              onImageSelected={(imageData, imageName) => {
                setFormImageData(imageData);
                setFormImageName(imageName);
              }}
              currentImage={formImageData}
              onImageRemove={() => {
                setFormImageData(undefined);
                setFormImageName(undefined);
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {selectedTemplate ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
