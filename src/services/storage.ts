import { Contact } from "@/data/contacts";
import { Recipe } from "@/data/recipes";

export interface ContactInteraction {
  id: string;
  contactId: number;
  date: string;
  type: "llamada" | "whatsapp" | "mensaje" | "nota" | "rellamar";
  description: string;
  recipeId?: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  imageData?: string; // Base64 encoded image
  imageName?: string; // Original filename
  createdAt: string;
}

const DB_NAME = "ThermomixCRM";
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create contacts store
      if (!database.objectStoreNames.contains("contacts")) {
        database.createObjectStore("contacts", { keyPath: "id" });
      }

      // Create recipes store
      if (!database.objectStoreNames.contains("recipes")) {
        database.createObjectStore("recipes", { keyPath: "id" });
      }

      // Create interactions store
      if (!database.objectStoreNames.contains("interactions")) {
        const store = database.createObjectStore("interactions", { keyPath: "id" });
        store.createIndex("contactId", "contactId", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }

      // Create templates store
      if (!database.objectStoreNames.contains("templates")) {
        database.createObjectStore("templates", { keyPath: "id" });
      }
    };
  });
};

// Contacts
export const getContacts = async (): Promise<Contact[]> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["contacts"], "readonly");
    const store = transaction.objectStore("contacts");
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const addContact = async (contact: Contact): Promise<Contact> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    const request = store.add(contact);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(contact);
  });
};

export const updateContact = async (contact: Contact): Promise<Contact> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    const request = store.put(contact);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(contact);
  });
};

export const deleteContact = async (id: number): Promise<void> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Recipes
export const getRecipes = async (): Promise<Recipe[]> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["recipes"], "readonly");
    const store = transaction.objectStore("recipes");
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const addRecipe = async (recipe: Recipe): Promise<Recipe> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["recipes"], "readwrite");
    const store = transaction.objectStore("recipes");
    const request = store.add(recipe);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(recipe);
  });
};

export const updateRecipe = async (recipe: Recipe): Promise<Recipe> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["recipes"], "readwrite");
    const store = transaction.objectStore("recipes");
    const request = store.put(recipe);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(recipe);
  });
};

export const deleteRecipe = async (id: number): Promise<void> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["recipes"], "readwrite");
    const store = transaction.objectStore("recipes");
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Interactions
export const getInteractions = async (contactId?: number): Promise<ContactInteraction[]> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["interactions"], "readonly");
    const store = transaction.objectStore("interactions");
    
    let request;
    if (contactId) {
      const index = store.index("contactId");
      request = index.getAll(contactId);
    } else {
      request = store.getAll();
    }

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as ContactInteraction[];
      resolve(result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    };
  });
};

export const addInteraction = async (interaction: ContactInteraction): Promise<ContactInteraction> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["interactions"], "readwrite");
    const store = transaction.objectStore("interactions");
    const request = store.add(interaction);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(interaction);
  });
};

// Templates
export const getTemplates = async (): Promise<MessageTemplate[]> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["templates"], "readonly");
    const store = transaction.objectStore("templates");
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const addTemplate = async (template: MessageTemplate): Promise<MessageTemplate> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["templates"], "readwrite");
    const store = transaction.objectStore("templates");
    const request = store.add(template);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(template);
  });
};

export const updateTemplate = async (template: MessageTemplate): Promise<MessageTemplate> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["templates"], "readwrite");
    const store = transaction.objectStore("templates");
    const request = store.put(template);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(template);
  });
};

export const deleteTemplate = async (id: string): Promise<void> => {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["templates"], "readwrite");
    const store = transaction.objectStore("templates");
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// Export/Import
export const exportData = async () => {
  const contacts = await getContacts();
  const recipes = await getRecipes();
  const interactions = await getInteractions();
  const templates = await getTemplates();

  return {
    contacts,
    recipes,
    interactions,
    templates,
    exportedAt: new Date().toISOString(),
  };
};

export const importData = async (data: {
  contacts?: Contact[];
  recipes?: Recipe[];
  interactions?: ContactInteraction[];
  templates?: MessageTemplate[];
}) => {
  if (data.contacts) {
    for (const contact of data.contacts) {
      await updateContact(contact);
    }
  }

  if (data.recipes) {
    for (const recipe of data.recipes) {
      await updateRecipe(recipe);
    }
  }

  if (data.interactions) {
    for (const interaction of data.interactions) {
      await addInteraction(interaction);
    }
  }

  if (data.templates) {
    for (const template of data.templates) {
      await updateTemplate(template);
    }
  }
};
