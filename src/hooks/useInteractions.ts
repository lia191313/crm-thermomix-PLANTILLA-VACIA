import { useState, useEffect } from "react";
import { ContactInteraction, getInteractions, addInteraction, initDB } from "@/services/storage";
import { nanoid } from "nanoid";

export const useInteractions = (contactId?: number) => {
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInteractions = async () => {
      try {
        await initDB();
        const data = await getInteractions(contactId);
        setInteractions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading interactions");
      } finally {
        setLoading(false);
      }
    };

    loadInteractions();
  }, [contactId]);

  const recordInteraction = async (
    contact_id: number,
    type: "llamada" | "whatsapp" | "mensaje" | "nota",
    description: string,
    recipeId?: number
  ) => {
    try {
      const interaction: ContactInteraction = {
        id: nanoid(),
        contactId: contact_id,
        date: new Date().toISOString(),
        type,
        description,
        recipeId,
      };
      await addInteraction(interaction);
      setInteractions([interaction, ...interactions]);
      return interaction;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recording interaction");
      throw err;
    }
  };

  return {
    interactions,
    loading,
    error,
    recordInteraction,
  };
};
