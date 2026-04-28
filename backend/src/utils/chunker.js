//(idk if i should change chunk size based on file type)
export const chunkText = (text, chunkSize = 150, overlap = 25) => {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let current = [];
    let wordCount = 0;

    for (const sentence of sentences) {
        const sentenceWords = sentence.split(' ');
        
        if (wordCount + sentenceWords.length > chunkSize) {
            if (current.length) chunks.push(current.join(' ').trim());
            // keep last `overlap` words as start of next chunk
            const overlapWords = current.join(' ').split(' ').slice(-overlap);
            current = [...overlapWords, ...sentenceWords];
            wordCount = current.length;
        } else {
            current.push(sentence);
            wordCount += sentenceWords.length;
        }
    }

    if (current.length) chunks.push(current.join(' ').trim());
    return chunks;
}

