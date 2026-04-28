import { supabase } from '../api/sbClient.js';

export const insertChunks = async(chunks, embeddings, userId, systemId, fileName) => {
    const rows = chunks.map((chunk, index) => (
        {
            user_id: userId,
            system_id: systemId,
            file_name: fileName,
            content: chunk,
            embedding: embeddings[index]
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