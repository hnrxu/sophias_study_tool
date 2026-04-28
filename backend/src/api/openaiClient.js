import OpenAI from "openai";
const openai = new OpenAI();

export const embedChunks = async(chunks) => {
    const embeddings = [];
    for (const chunk of chunks) {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: chunk,
            encoding_format: "float",
        });

        embeddings.push(response.data[0].embedding);

    }
    return embeddings;

}

export const embedQuery = async(query) => {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
        encoding_format: "float",
    });

    return response;

}

export const makeResponse = async (chunks, query, mode = 'specific') => {
    const formattedChunks = chunks
        .map((chunk) => `File: ${chunk.file_name}\nContent:\n${chunk.content}`)
        .join("\n\n---\n\n");

    const systemPrompt = mode === 'broad' 
        ? `You are a study assistant. The user wants a summary of their material.
            - Summarize the key concepts and ideas relevant to their request from the provided context.
            - If they ask for specific chapters or topics, focus only on those.
            - If they ask for everything, cover ALL the material from ALL files.
            - Organize the summary clearly by topic or file.
            - Do NOT make up information not in the context.`
        : `You are a study assistant.
            - Use ONLY the provided context.
            - If the answer is clearly in the context, answer directly and concisely.
            - If partially in context, answer what you can and note what is missing.
            - If not in context, say "I couldn't find information about that in your documents."
            - Do NOT make up information.
            - Mention which file(s) the answer came from.
            - Include short supporting quotes.`

    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${formattedChunks}\n\nQuestion: ${query}` }
        ]
    })

    return response.output_text;
}

export const classifyResponse = async (query) => {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
        {
            role: 'system',
            content: 'Classify the user query as "specific" (looking for specific information or facts), or "broad" (wants a summary, overview, list, or anything requiring all the material). Reply with only one word: "specific" or "broad".'
        },
        {
            role: 'user',
            content: query
        }
        ]
    })
    return response;

}

