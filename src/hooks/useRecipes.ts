import { useState, useEffect } from "react";
import { Recipe, recipes as defaultRecipes } from "@/data/recipes";
import { getRecipes, addRecipe, updateRecipe, deleteRecipe, initDB } from "@/services/storage";

export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize database and load recipes
  useEffect(() => {
    const loadRecipes = async () => {
      try {
        await initDB();
        const storedRecipes = await getRecipes();
        
        if (storedRecipes.length === 0) {
          // First time: load default recipes
          for (const recipe of defaultRecipes) {
            await addRecipe(recipe);
          }
          setRecipes(defaultRecipes);
        } else {
          setRecipes(storedRecipes);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading recipes");
        // Fallback to default recipes
        setRecipes(defaultRecipes);
      } finally {
        setLoading(false);
      }
    };

    loadRecipes();
  }, []);

  const addNewRecipe = async (recipe: Omit<Recipe, "id">) => {
    try {
      const newRecipe: Recipe = {
        ...recipe,
        id: Math.max(...recipes.map(r => r.id), 0) + 1,
      };
      await addRecipe(newRecipe);
      setRecipes([...recipes, newRecipe]);
      return newRecipe;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding recipe");
      throw err;
    }
  };

  const updateExistingRecipe = async (recipe: Recipe) => {
    try {
      await updateRecipe(recipe);
      setRecipes(recipes.map(r => r.id === recipe.id ? recipe : r));
      return recipe;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating recipe");
      throw err;
    }
  };

  const deleteExistingRecipe = async (id: number) => {
    try {
      await deleteRecipe(id);
      setRecipes(recipes.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deleting recipe");
      throw err;
    }
  };

  return {
    recipes,
    loading,
    error,
    addRecipe: addNewRecipe,
    updateRecipe: updateExistingRecipe,
    deleteRecipe: deleteExistingRecipe,
  };
};
