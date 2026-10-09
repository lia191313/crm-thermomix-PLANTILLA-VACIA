import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { X } from "lucide-react";

interface RecetaFormData {
  nombre: string;
  categoria: string;
  tiempo: string;
  raciones: string;
  dificultad: "fácil" | "media" | "difícil";
  imagen: string;
  descripcion: string;
  ingredientes: string;
  pasos: string;
  enlaceCookidoo: string;
}

interface AgregarRecetaFormProps {
  onSubmit: (data: RecetaFormData) => void;
  onCancel: () => void;
  initialData?: RecetaFormData;
}

export default function AgregarRecetaForm({
  onSubmit,
  onCancel,
  initialData,
}: AgregarRecetaFormProps) {
  const [formData, setFormData] = useState<RecetaFormData>(
    initialData || {
      nombre: "",
      categoria: "Platos principales",
      tiempo: "",
      raciones: "",
      dificultad: "media",
      imagen: "",
      descripcion: "",
      ingredientes: "",
      pasos: "",
      enlaceCookidoo: "",
    }
  );

  const [previewImage, setPreviewImage] = useState(initialData?.imagen || "");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "imagen") {
      setPreviewImage(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      toast.error("El nombre de la receta es obligatorio");
      return;
    }

    if (!formData.imagen.trim()) {
      toast.error("La URL de la imagen es obligatoria");
      return;
    }

    onSubmit(formData);
    toast.success("Receta guardada correctamente");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              {initialData ? "Editar Receta" : "Agregar Nueva Receta"}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Nombre de la Receta *
              </label>
              <Input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej: Pollo con crema de limón"
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Categoría
              </label>
              <select
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option>Platos principales</option>
                <option>Sopas</option>
                <option>Repostería</option>
                <option>Entrantes</option>
                <option>Desayunos</option>
                <option>Bebidas</option>
                <option>Salsas</option>
              </select>
            </div>

            {/* Tiempo, Raciones, Dificultad */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Tiempo
                </label>
                <Input
                  type="text"
                  name="tiempo"
                  value={formData.tiempo}
                  onChange={handleChange}
                  placeholder="Ej: 30 min"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Raciones
                </label>
                <Input
                  type="text"
                  name="raciones"
                  value={formData.raciones}
                  onChange={handleChange}
                  placeholder="Ej: 4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Dificultad
                </label>
                <select
                  name="dificultad"
                  value={formData.dificultad}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="fácil">Fácil</option>
                  <option value="media">Media</option>
                  <option value="difícil">Difícil</option>
                </select>
              </div>
            </div>

            {/* URL Imagen */}
            <div>
              <label className="block text-sm font-medium mb-1">
                URL de la Imagen *
              </label>
              <Input
                type="text"
                name="imagen"
                value={formData.imagen}
                onChange={handleChange}
                placeholder="Pega aquí la URL de la imagen de Cookidoo"
              />
              {previewImage && (
                <div className="mt-2">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-md"
                    onError={() => setPreviewImage("")}
                  />
                </div>
              )}
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Descripción
              </label>
              <Textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                placeholder="Breve descripción de la receta"
                rows={2}
              />
            </div>

            {/* Ingredientes */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Ingredientes
              </label>
              <Textarea
                name="ingredientes"
                value={formData.ingredientes}
                onChange={handleChange}
                placeholder="Pega aquí los ingredientes de Cookidoo (uno por línea o como venga)"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                Copia y pega directamente desde Cookidoo
              </p>
            </div>

            {/* Pasos */}
            <div>
              <label className="block text-sm font-medium mb-1">Pasos</label>
              <Textarea
                name="pasos"
                value={formData.pasos}
                onChange={handleChange}
                placeholder="Pega aquí los pasos de Cookidoo (uno por línea o como venga)"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                Copia y pega directamente desde Cookidoo
              </p>
            </div>

            {/* Enlace Cookidoo */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Enlace a Cookidoo
              </label>
              <Input
                type="text"
                name="enlaceCookidoo"
                value={formData.enlaceCookidoo}
                onChange={handleChange}
                placeholder="https://cookidoo.es/recipes/recipe/..."
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {initialData ? "Actualizar Receta" : "Guardar Receta"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
