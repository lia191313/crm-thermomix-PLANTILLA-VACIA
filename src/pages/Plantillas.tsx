import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Copy, CheckCircle, Image as ImageIcon, Share2, Download, Maximize2 } from "lucide-react";
import { MessageSquare as IconoCabecera } from "lucide-react";
import { CabeceraFormacion } from "@/components/EstiloFormacion";
import { useTemplates } from "@/hooks/useTemplates";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

// ---------- Imagen de la plantilla (flyer) ----------

/** Convierte la imagen guardada (data URL) en un archivo para compartir o descargar. */
async function imagenComoArchivo(dataUrl: string, nombre?: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type.split("/")[1] || "jpg";
  const base = (nombre || "flyer").replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

function descargarImagen(dataUrl: string, nombre?: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = nombre || "flyer.jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** El portapapeles solo acepta PNG: se pasa la imagen por un canvas. */
async function copiarImagen(dataUrl: string) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const png = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export default function Plantillas() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | undefined>();
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImageData, setFormImageData] = useState<string | undefined>();
  const [formImageName, setFormImageName] = useState<string | undefined>();
  const [copied, setCopied] = useState<string | null>(null);
  const [verImagen, setVerImagen] = useState<typeof templates[0] | null>(null);

  const compartir = async (t: typeof templates[0]) => {
    if (!t.imageData) return;
    try {
      const archivo = await imagenComoArchivo(t.imageData, t.imageName);
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: t.content || undefined, title: t.name });
        return;
      }
      // En el ordenador no siempre se puede compartir: se copia la imagen.
      await copiarImagen(t.imageData);
      toast.success("Imagen copiada. Pégala en WhatsApp con Ctrl+V");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // ha cerrado el menú de compartir
      console.error(e);
      toast.error("No se pudo compartir. Prueba con Descargar.");
    }
  };

  const copiarSoloImagen = async (t: typeof templates[0]) => {
    if (!t.imageData) return;
    try {
      await copiarImagen(t.imageData);
      toast.success("Imagen copiada. Pégala en WhatsApp con Ctrl+V");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo copiar la imagen. Prueba con Descargar.");
    }
  };

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
        <CabeceraFormacion icono={IconoCabecera} titulo="Plantillas" subtitulo="Tus mensajes guardados, con imágenes" />
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
              <button
                type="button"
                onClick={() => setVerImagen(template)}
                title="Ver el flyer en grande"
                className="group relative mb-4 rounded-lg overflow-hidden h-56 bg-gray-100 cursor-zoom-in"
              >
                <img
                  src={template.imageData}
                  alt={template.name}
                  className="w-full h-full object-contain"
                />
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                  <Maximize2 className="w-3 h-3" /> Ver en grande
                </span>
              </button>
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

      {/* Flyer en grande */}
      <Dialog open={!!verImagen} onOpenChange={(o) => !o && setVerImagen(null)}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-4">
          {verImagen?.imageData && (
            <>
              <DialogHeader>
                <DialogTitle>{verImagen.name}</DialogTitle>
              </DialogHeader>
              <img src={verImagen.imageData} alt={verImagen.name} className="w-full h-auto rounded-lg" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button onClick={() => compartir(verImagen)} className="gap-2">
                  <Share2 className="w-4 h-4" /> Compartir
                </Button>
                <Button variant="outline" onClick={() => copiarSoloImagen(verImagen)} className="gap-2">
                  <ImageIcon className="w-4 h-4" /> Copiar imagen
                </Button>
                <Button variant="outline" onClick={() => handleCopy(verImagen.content, verImagen.id)} className="gap-2">
                  <Copy className="w-4 h-4" /> Copiar texto
                </Button>
                <Button variant="outline" onClick={() => descargarImagen(verImagen.imageData!, verImagen.imageName)} className="gap-2">
                  <Download className="w-4 h-4" /> Descargar
                </Button>
              </div>
              {verImagen.content && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded bg-muted p-3">{verImagen.content}</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
