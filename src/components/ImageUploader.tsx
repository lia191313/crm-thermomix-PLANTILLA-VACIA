import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ImageUploaderProps {
  onImageSelected: (imageData: string, imageName: string) => void;
  currentImage?: string;
  onImageRemove?: () => void;
}

export default function ImageUploader({
  onImageSelected,
  currentImage,
  onImageRemove,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(currentImage);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPreview(imageData);
      onImageSelected(imageData, file.name);
      toast.success("Imagen cargada correctamente");
    };
    reader.onerror = () => {
      toast.error("Error al cargar la imagen");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setPreview(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onImageRemove?.();
    toast.success("Imagen eliminada");
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Imagen (Opcional)</label>

      {preview ? (
        <div className="space-y-3">
          <div className="relative w-full h-40 bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
              <Button
                type="button"
                onClick={handleRemoveImage}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Eliminar
              </Button>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full gap-2"
          >
            <Upload className="w-4 h-4" />
            Cambiar Imagen
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer"
        >
          <ImageIcon className="w-8 h-8 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">
            Haz clic para cargar una imagen
          </span>
          <span className="text-xs text-gray-500">
            PNG, JPG, GIF (máx. 5MB)
          </span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
