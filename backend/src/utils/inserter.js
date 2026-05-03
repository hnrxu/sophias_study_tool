import { supabase } from '../api/sbClient.js';

export const insertChunks = async(chunks, embeddings, userId, systemId, fileName, timestamps=[]) => {
    const rows = chunks.map((chunk, index) => (
        {
            user_id: userId,
            system_id: systemId,
            file_name: fileName,
            content: chunk,
            embedding: embeddings[index],
            start: timestamps[index]?.start ?? null,
            end: timestamps[index]?.end ?? null
        }
    ))
    const response = await supabase
                            .from("chunks")
                            .insert(rows);
    if (response.error) {
        console.log(response.error);
    }
    console.log(fileName);
}


export const getOrCreateDeck = async (name, systemId, userId) => {
  const { data: existing } = await supabase
    .from('decks')
    .select('id')
    .eq('name', name)
    .eq('system_id', systemId)
    .single()

  if (existing) return existing.id

  const { data: newDeck } = await supabase
    .from('decks')
    .insert({ name, system_id: systemId, user_id: userId })
    .select('id')
    .single()

  return newDeck.id
}

export const saveFlashcards = async (cards, deckId) => {
  const rows = cards.map(card => ({
    deck_id: deckId,
    question: card.question,
    answer: card.answer
  }))

  await supabase.from('flashcards').insert(rows)
}