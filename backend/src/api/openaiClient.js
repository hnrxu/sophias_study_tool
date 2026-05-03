import OpenAI from "openai";
const openai = new OpenAI();
import { toFile } from 'openai';

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

export const makeResponse = async (chunks, query, mode = 'specific', onChunk = null) => {
    const formattedChunks = chunks
        .map((chunk) => `File: ${chunk.file_name}\nContent:\n${chunk.content}`)
        .join("\n\n---\n\n");

    const systemPrompt = mode === 'all' 
        ? `You are a study assistant. The user wants a complete overview of ALL their study material.
            - Cover every file and topic provided in the context.
            - Organize clearly by file or topic.
            - Be comprehensive — do not skip any files.
            - Do NOT make up information not in the context.
            - Write your full answer in plain text.
            - On the very last line, write ONLY a JSON array of the exact file paths you used, e.g. ["path1.pdf", "path2.pdf"]
            - No label, no prefix, nothing after the JSON array.
            - Only include files you actually used in your answer.`
        : mode === 'topic' 
        ? `You are a study assistant. The user wants a detailed overview of a specific topic.
            - Cover everything relevant to their topic from the provided context.
            - Be thorough and organized.
            - If the topic is not in the context, say "I couldn't find information about that in your documents."
            - Do NOT make up information.
            - Write your full answer in plain text.
            - On the very last line, write ONLY a JSON array of the exact file paths you used, e.g. ["path1.pdf", "path2.pdf"]
            - No label, no prefix, nothing after the JSON array.
            - Only include files you actually used in your answer.`
  
        : `You are a study assistant.
            - Use ONLY the provided context.
            - If the answer is clearly in the context, answer directly and concisely.
            - If partially in context, answer what you can and note what is missing.
            - If not in context, say "I couldn't find information about that in your documents."
            - Do NOT make up information.
            - Mention which file(s) the answer came from.
            - Include short supporting quotes.
            - Return ONLY valid JSON, no markdown, no extra text, in this exact format:
            {"answer": "your answer here", "sources_used": ["full/file/path1.pdf", "full/file/path2.pdf"]}
            - sources_used must be an array of strings — the exact file paths from the context, not an object.
            - "answer" must be a plain string of text, NOT a nested object or JSON.
            - Only include files you actually used in your answer.`

            // stream responses
    if (onChunk) {
        const stream = openai.responses.stream({
            model: 'gpt-4o-mini',
            input: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Context:\n${formattedChunks}\n\nQuestion: ${query}` }
            ]
        })
        for await (const event of stream) {
            if (event.type === 'response.output_text.delta') {
                onChunk(event.delta)
            }
        }
        return
    }

    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Context:\n${formattedChunks}\n\nQuestion: ${query}` }
        ]
    })

    return response.output_text;
}

export const classifyResponse = async (query, fileNames = []) => {
    const fileList = fileNames.length > 0
        ? `\nAvailable files in this system:\n${fileNames.map(f => `- ${f}`).join('\n')}`
        : ''

    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
        {
            role: 'system',
            content: `Classify the user query and extract relevant info.
            Return ONLY valid JSON, no markdown, no extra text:
            {
            "intent": one of "all", "topic", "specific", "flashcard", "add_flashcard", "remake_deck", "delete_deck", "file_query", "audio_notes", "asmr_notes", "none",
            "deck_name": the topic or subject name to use as the deck name (short, 1-4 words), or null if not applicable,
            "file_names": an array of exact file names from the available files list that match what the user is referring to, or null if not applicable
            }

            Intent definitions:
            - "all": wants summary of ALL uploaded material
            - "topic": wants a broad comprehensive overview of a subject
            - "specific": wants a direct answer to a question or explanation of a concept
            - "flashcard": wants to generate multiple flashcards about a topic
            - "add_flashcard": wants to add a single flashcard to an existing deck
            - "remake_deck": wants to regenerate an existing deck
            - "delete_deck": wants to delete a deck
            - "file_query": user references a specific file by name or partial name
            - "audio_notes": wants to generate audio/spoken notes about a topic
            - "asmr_notes": wants to generate ASMR-style soft spoken audio notes about a topic
            - "none": message is not related to studying, files, or any supported action

            Use "topic" only when the user explicitly wants a broad, comprehensive overview.
            Use "specific" for any direct question or explanation request.
            If the message is casual, greeting, or unrelated to study material, use "none".
            ${fileList}

            Examples:
            - "summarize everything" → intent: "all", file_names: null
            - "give me an overview of all my notes" → intent: "all", file_names: null
            - "what is big endian" → intent: "specific", deck_name: null, file_names: null
            - "what does little endian mean" → intent: "specific", deck_name: null, file_names: null
            - "what is 0xFF in decimal" → intent: "specific", deck_name: null, file_names: null
            - "how does memory addressing work" → intent: "specific", deck_name: null, file_names: null
            - "what are the differences between big and little endian" → intent: "specific", deck_name: null, file_names: null
            - "explain hexadecimal" → intent: "specific", deck_name: null, file_names: null
            - "give me a detailed overview of endianness" → intent: "topic", deck_name: null, file_names: null
            - "cover everything about memory representation" → intent: "topic", deck_name: null, file_names: null
            - "walk me through number systems" → intent: "topic", deck_name: null, file_names: null
            - "what does the xu paper say" → intent: "file_query", file_names: ["Xu_21899448_TermPaperFinal.pdf"]
            - "summarize the jan 7 notes" → intent: "file_query", file_names: ["1a_Jan7.pdf"]
            - "what's in 1a" → intent: "file_query", file_names: ["1a_Jan7.pdf"]
            - "make flashcards about endianness" → intent: "flashcard", deck_name: "endianness", file_names: null
            - "make flashcards from the xu paper" → intent: "flashcard", deck_name: "xu paper", file_names: ["Xu_21899448_TermPaperFinal.pdf"]
            - "make flashcards from 1a" → intent: "flashcard", deck_name: "1a", file_names: ["1a_Jan7.pdf"]
            - "add a flashcard to my endianness deck" → intent: "add_flashcard", deck_name: "endianness", file_names: null
            - "add a flashcard about hex from the jan 7 notes to my numbers deck" → intent: "add_flashcard", deck_name: "numbers", file_names: ["1a_Jan7.pdf"]
            - "remake my endianness deck" → intent: "remake_deck", deck_name: "endianness", file_names: null
            - "remake my endianness deck using 1a" → intent: "remake_deck", deck_name: "endianness", file_names: ["1a_Jan7.pdf"]
            - "delete the endianness deck" → intent: "delete_deck", deck_name: "endianness", file_names: null
            - "generate audio on endianness" → intent: "audio_notes", deck_name: null, file_names: null
            - "make audio notes from the xu paper" → intent: "audio_notes", deck_name: null, file_names: ["Xu_21899448_TermPaperFinal.pdf"]
            - "read me the notes on memory" → intent: "audio_notes", deck_name: null, file_names: null
            - "make asmr files on endianness" → intent: "asmr_notes", deck_name: null, file_names: null
            - "asmr version of the xu paper" → intent: "asmr_notes", deck_name: null, file_names: ["Xu_21899448_TermPaperFinal.pdf"]
            - "asmr notes on memory" → intent: "asmr_notes", deck_name: null, file_names: null
            - "hello" → intent: "none"
            - "how are you" → intent: "none"
            - "thanks" → intent: "none"
            - "what's up" → intent: "none"
            - "ok" → intent: "none"
            - "cool" → intent: "none"`
        },
        { role: 'user', content: query }
        ]
    })
    return JSON.parse(response.output_text)
}



export const makeFlashcards = async (content, query) => {
   
    const response = await openai.responses.create({
                    model: 'gpt-4o-mini',
                    input: [
                    {
                        role: 'system',
                        content: `Generate flashcards from the provided study material relevant to the user's request.
                - Focus on key concepts, definitions, and important facts.
                - Choose the number of flashcards based on the amount of content given and the instructions in the user's request (if available).
                - Return ONLY a valid JSON object, no markdown, no extra text:
                {"type": "flashcard", "answer": "Flashcards created!", "cards": [{"question": "...", "answer": "..."}, ...]}`
                    },
                    { role: 'user', content: `Material:\n${content}\n\nRequest: ${query}` }
                    ]
                })

    return response.output_text;
}

export const makeSingleFlashcard = async (query, context = '') => {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
        {
            role: 'system',
            content: `Generate a single flashcard based on the user's request using ONLY the provided context.
    If the context does not contain relevant information, return {"question": null, "answer": null}.
    Return ONLY valid JSON, no markdown, no extra text:
    {"question": "...", "answer": "..."}`
        },
        { role: 'user', content: `Context:\n${context}\n\nRequest: ${query}` }
        ]
    })
    return response.output_text
}


export const makeTranscription = async (buffer, originalname, mimetype) => {

    const transcription = await openai.audio.transcriptions.create({
        file: await toFile(buffer, originalname, { type: mimetype }),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"]
    });

    return transcription;

}


export const formatAudio = async (content, query) => {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
            {
                role: 'system',
                content: `You are a study assistant. Your job is to rewrite the provided study material as a natural, flowing spoken script.
                - Rewrite the content as if a teacher is explaining it out loud to a student
                - Use plain conversational sentences only
                - Change the content as little as possible and do not leave out details
                - No bullet points, no markdown, no headers, no lists
                - Do not refuse or comment on the task — just write the script directly
                - Only use information from the provided context`
            },
            { role: 'user', content: `Rewrite this study material as a spoken script about "${query}":\n\n${content}` }
        ]
    });
    return response.output_text
}


export const nameAudio = async (query) => {
    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: [
            {
                role: 'system',
                content: `Generate a short, descriptive filename for an audio notes file based on the user's query.
                - 2-5 words max
                - Title case
                - No special characters, no punctuation
                - Return ONLY the name, nothing else
                - Examples: "Endianness Overview", "Memory Addressing", "Jan 7 Lecture Notes", "Xu Paper Summary"`
            },
            { role: 'user', content: query }
        ]
    })
    return response.output_text.trim()
}
