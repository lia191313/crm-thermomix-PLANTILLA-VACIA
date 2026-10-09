import { useSupabaseRellamar } from "./useSupabaseRellamar";

export function useRellamar() {
  const { rellamarIds, rellamarData, toggleRellamar: toggleSupabase, esRellamar, loading } = useSupabaseRellamar();

  const toggle = async (contactId: number, fechaRellamada?: string | null) => {
    await toggleSupabase(contactId, fechaRellamada);
  };

  const quitarRellamar = async (contactId: number) => {
    if (esRellamar(contactId)) {
      await toggleSupabase(contactId);
    }
  };

  return {
    rellamarIds,
    rellamarData,
    rellamarArray: rellamarIds,
    toggleRellamar: toggle,
    esRellamar,
    quitarRellamar,
    loading
  };
}
