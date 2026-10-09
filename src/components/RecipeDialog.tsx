import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Recipe } from "@/data/recipes";

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe?: Recipe;
  onSave: (recipe: Omit<Recipe, "id">) => Promise<void>;
}

export default function RecipeDialog({ open, onOpenChange, recipe, onSave }: RecipeDialogProps) {
  const [formData, setFormData] = useState<Omit<Recipe, "id">>({
    nombre: recipe?.nombre || "",
    categoria: recipe?.categoria || "Platos principales",
    tiempo: recipe?.tiempo || "30 min",
    puntuacion: recipe?.puntuacion || 4.5,
    imagen: recipe?.imagen || "",
    descripcion: recipe?.descripcion || "",
  });

  const handleSave = async () => {
    await onSave(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipe ? "Editar Receta" : "Nueva Receta"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="nombre">Nombre de la Receta</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre de la receta"
            />
          </div>

          <div>
            <Label htmlFor="categoria">Categoría</Label>
            <select
              id="categoria"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            >
              <option>Platos principales</option>
              <option>Repostería</option>
              <option>Salsas y condimentos</option>
              <option>Sopas y cremas</option>
              <option>Desayunos</option>
              <option>Postres</option>
              <option>Bebidas</option>
              <option>Otros</option>
            </select>
          </div>

          <div>
            <Label htmlFor="tiempo">Tiempo de Preparación</Label>
            <Input
              id="tiempo"
              value={formData.tiempo}
              onChange={(e) => setFormData({ ...formData, tiempo: e.target.value })}
              placeholder="Ej: 30 min"
            />
          </div>

          <div>
            <Label htmlFor="puntuacion">Puntuación (0-5)</Label>
            <Input
              id="puntuacion"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={formData.puntuacion}
              onChange={(e) => setFormData({ ...formData, puntuacion: parseFloat(e.target.value) })}
            />
          </div>

          <div>
            <Label htmlFor="imagen">URL de la Imagen</Label>
            <Input
              id="imagen"
              value={formData.imagen}
              onChange={(e) => setFormData({ ...formData, imagen: e.target.value })}
              placeholder="https://ejemplo.com/imagen.jpg"
            />
            {formData.imagen && (
              <img
                src={formData.imagen}
                alt="Preview"
                className="mt-2 w-full h-32 object-cover rounded-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>

          <div>
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción de la receta"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {recipe ? "Actualizar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
