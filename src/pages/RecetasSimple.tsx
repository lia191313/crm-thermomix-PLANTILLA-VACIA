import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import AgregarRecetaForm from "@/components/AgregarRecetaForm";

interface Receta {
  id: string;
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

export default function RecetasSimple() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingReceta, setEditingReceta] = useState<Receta | undefined>();
  const [selectedReceta, setSelectedReceta] = useState<Receta | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("");

  // Cargar recetas del localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recetas_personalizadas");
    if (saved) {
      try {
        setRecetas(JSON.parse(saved));
      } catch (error) {
        console.error("Error loading recipes:", error);
      }
    }
  }, []);

  // Guardar recetas en localStorage
  const guardarRecetas = (nuevasRecetas: Receta[]) => {
    setRecetas(nuevasRecetas);
    localStorage.setItem("recetas_personalizadas", JSON.stringify(nuevasRecetas));
  };

  const handleAgregarReceta = (data: any) => {
    if (editingReceta) {
      // Editar
      const updated = recetas.map((r) =>
        r.id === editingReceta.id ? { ...data, id: editingReceta.id } : r
      );
      guardarRecetas(updated);
      setEditingReceta(undefined);
      toast.success("Receta actualizada");
    } else {
      // Agregar nueva
      const newReceta: Receta = {
        ...data,
        id: Date.now().toString(),
      };
      guardarRecetas([...recetas, newReceta]);
      toast.success("Receta agregada");
    }
    setShowForm(false);
  };

  const handleEliminar = (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta receta?")) {
      guardarRecetas(recetas.filter((r) => r.id !== id));
      setSelectedReceta(undefined);
      toast.success("Receta eliminada");
    }
  };

  const filteredRecetas = recetas.filter((receta) => {
    const matchesSearch = receta.nombre
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategoria =
      !filterCategoria || receta.categoria === filterCategoria;
    return matchesSearch && matchesCategoria;
  });

  const categorias = Array.from(new Set(recetas.map((r) => r.categoria)));

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mis Recetas</h1>
          <p className="text-gray-600 mt-1">
            {filteredRecetas.length} de {recetas.length} recetas
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingReceta(undefined);
            setShowForm(true);
          }}
          className="bg-green-600 hover:bg-green-700"
        >
          <Plus size={20} className="mr-2" />
          Agregar Receta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Buscar receta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Grid de Recetas */}
      {filteredRecetas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500 mb-4">No hay recetas aún</p>
          <Button
            onClick={() => {
              setEditingReceta(undefined);
              setShowForm(true);
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            Agregar tu primera receta
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecetas.map((receta) => (
            <Card
              key={receta.id}
              className="overflow-hidden hover:shadow-lg transition cursor-pointer"
              onClick={() => setSelectedReceta(receta)}
            >
              <img
                src={receta.imagen}
                alt={receta.nombre}
                className="w-full h-48 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://via.placeholder.com/300x200?text=Sin+imagen";
                }}
              />
              <div className="p-4">
                <h3 className="font-bold text-lg mb-1">{receta.nombre}</h3>
                <p className="text-sm text-gray-600 mb-2">{receta.categoria}</p>
                <div className="flex gap-2 mb-3">
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    {receta.tiempo}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {receta.raciones} raciones
                  </span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">
                  {receta.descripcion}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalles */}
      {selectedReceta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">{selectedReceta.nombre}</h2>
                <button
                  onClick={() => setSelectedReceta(undefined)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <img
                src={selectedReceta.imagen}
                alt={selectedReceta.nombre}
                className="w-full h-64 object-cover rounded-lg mb-4"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://via.placeholder.com/600x400?text=Sin+imagen";
                }}
              />

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-gray-100 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Tiempo</p>
                  <p className="font-bold">{selectedReceta.tiempo}</p>
                </div>
                <div className="bg-gray-100 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Raciones</p>
                  <p className="font-bold">{selectedReceta.raciones}</p>
                </div>
                <div className="bg-gray-100 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Dificultad</p>
                  <p className="font-bold capitalize">{selectedReceta.dificultad}</p>
                </div>
                <div className="bg-gray-100 p-2 rounded text-center">
                  <p className="text-xs text-gray-600">Categoría</p>
                  <p className="font-bold text-sm">{selectedReceta.categoria}</p>
                </div>
              </div>

              {selectedReceta.descripcion && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Descripción</h3>
                  <p className="text-gray-700">{selectedReceta.descripcion}</p>
                </div>
              )}

              {selectedReceta.ingredientes && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Ingredientes</h3>
                  <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap text-sm">
                    {selectedReceta.ingredientes}
                  </div>
                </div>
              )}

              {selectedReceta.pasos && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">Pasos</h3>
                  <div className="bg-gray-50 p-3 rounded whitespace-pre-wrap text-sm">
                    {selectedReceta.pasos}
                  </div>
                </div>
              )}

              {selectedReceta.enlaceCookidoo && (
                <div className="mb-4">
                  <a
                    href={selectedReceta.enlaceCookidoo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:text-green-700 flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Ver en Cookidoo
                  </a>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => {
                    setEditingReceta(selectedReceta);
                    setShowForm(true);
                    setSelectedReceta(undefined);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Edit size={18} className="mr-2" />
                  Editar
                </Button>
                <Button
                  onClick={() => handleEliminar(selectedReceta.id)}
                  variant="destructive"
                  className="flex-1"
                >
                  <Trash2 size={18} className="mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <AgregarRecetaForm
          onSubmit={handleAgregarReceta}
          onCancel={() => {
            setShowForm(false);
            setEditingReceta(undefined);
          }}
          initialData={editingReceta}
        />
      )}
    </div>
  );
}
