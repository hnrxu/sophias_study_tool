import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from 'multer';
import { splitPdf, parsePdfByPage, splitAudio } from './utils/parser.js'
import { chunkText } from './utils/chunker.js'
import { insertChunks, getOrCreateDeck, saveFlashcards } from './utils/inserter.js'
import { classifyResponse, embedChunks, embedQuery, makeResponse, makeFlashcards, makeSingleFlashcard, makeTranscription, formatAudio, nameAudio } from "./api/openaiClient.js";
import { makeAudio } from "./api/elevenlabsClient.js";
import { supabase } from './api/sbClient.js';





dotenv.config();

const app = express();

app.use(cors({
  origin: "https://sophias-study-tool.vercel.app",
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;



// parses the formdata
const parser = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// endpts
app.get("/", (req, res) => {
    res.send("Backend is running");
});





app.post("/upload", parser.array('files'), async(req, res) => {
    try {
        const {systemId, userId} = req.body;
        const files = req.files;

        for (const file of files) {
            if (file.mimetype === 'application/pdf') {

                const pages = await splitPdf(file.buffer)
                for (const page of pages) {
                    const path = `${userId}/${systemId}/${file.originalname}/page-${page.pageNumber}.pdf`
                    const {error} = await supabase.storage
                        .from('files')
                        .upload(path, page.buffer, { contentType: 'application/pdf' })
                    if (error) {
                        console.log(error)
                    }
                }
                

                const parsedPages = await parsePdfByPage(file)
                for (const page of parsedPages) {
                    const pagePath = `${userId}/${systemId}/${file.originalname}/page-${page.pageNumber}.pdf`
                    const chunks = chunkText(page.text)
                    const embeddings = await embedChunks(chunks)
                    await insertChunks(chunks, embeddings, userId, systemId, pagePath);
                }
    
                //console.log(chunks);
            } else if ([
                'audio/mpeg',       // mp3, mpeg, mpga
                'audio/mp4',        // m4a
                'audio/x-m4a',      // m4a (alt)
                'audio/wav',        // wav
                'audio/x-wav',      // wav (alt)
                'audio/webm',       // webm
                'video/webm',       // webm (alt)
                'video/mp4',        // mp4
                ].includes(file.mimetype)) {

                    
                const audioChunks = await splitAudio(file.buffer, file.mimetype);
                console.log("split")
                // save to storage 
                const path = `${userId}/${systemId}/${file.originalname}`;
                const {error} = await supabase.storage
                .from('files')
                .upload(path, file.buffer, { contentType: file.mimetype });
                if (error) {
                        console.log(error)
                    }

                const chunks = [], timestamps = [];
                const GROUP_SIZE = 4;

                for (const audioChunk of audioChunks) {
                    const transcription = await makeTranscription(audioChunk, file.originalname, 'audio/mpeg');
                    const segments = transcription.segments;

                for (let i = 0; i < segments.length; i += GROUP_SIZE) {
                    const group = segments.slice(i, i + GROUP_SIZE);
                    chunks.push(group.map(s => s.text).join(' '));
                    timestamps.push({ start: group[0].start, end: group[group.length - 1].end });
                }
                }

                const embeddings = await embedChunks(chunks);
                await insertChunks(chunks, embeddings, userId, systemId, path, timestamps);
             

                
                //console.log(chunks);
            }
        }

        res.json("files received");

    } catch (error) {
        res.status(500).json(error.message);
    }
    
})

 
app.post("/search", async(req, res) => {
    try {
        const {query, systemId, userId} = req.body;

        const { data: system } = await supabase
            .from('systems')
            .select('id')
            .eq('id', systemId)
            .eq('user_id', userId)
            .single()

        if (!system) return res.status(403).json('Unauthorized');

        // getting files to see if any match
        const { data: files } = await supabase.storage
            .from('files')
            .list(`${userId}/${systemId}`)

        const fileNames = files?.map(f => f.name) || []

        // classify response type 
        const intentData = await classifyResponse(query, fileNames)

        

        const intent = intentData.intent
        const deckName = intentData.deck_name
        console.log(intent)
        console.log(deckName)

        if (intent === 'none') {
            return res.json({ answer: "I can only help with your study materials. Try asking a question about your files or making flashcards!", sources: [] })
        }

        if (intent === 'add_flashcard') {
            if (!deckName) return res.status(400).json('Please specify which deck to add the flashcard to')
            
            const { data: deck } = await supabase
                .from('decks')
                .select('id')
                .eq('name', deckName)
                .eq('system_id', systemId)
                .single()

            if (!deck) return res.status(404).json(`Deck "${deckName}" not found`)

            let chunks;
            if (intentData.file_names?.length > 0) {
                const { data } = await supabase
                    .from('chunks')
                    .select('*')
                    .eq('system_id', systemId)
                    .or(intentData.file_names.map(n => `file_name.ilike.%${n}%`).join(','))
                chunks = data
            } else {
                const embeddedResponse = await embedQuery(query)
                const embeddedQuery = embeddedResponse.data[0].embedding
                const { data, error } = await supabase.rpc('match_chunks', {
                    query_embedding: embeddedQuery,
                    match_system_id: systemId,
                    match_count: 5
                })
                if (error) return res.status(500).json({error: { message: error.message } })
                chunks = data
            }

            const content = chunks.map(c => c.content).join('\n\n')
            const raw = await makeSingleFlashcard(query, content)
            const card = JSON.parse(raw)

            if (!card.question) return res.json({ type: 'no_info', answer: 'No relevant information found in your documents' })

            await supabase.from('flashcards').insert({ deck_id: deck.id, question: card.question, answer: card.answer })
            return res.json({ type: 'flashcard', answer: 'Added flashcard to' + deckName, deck_id: deck.id, deck_name: deckName, cards: [card] })
        }

        if (intent === 'remake_deck') {
            const { data: deck } = await supabase
                .from('decks')
                .select('id')
                .eq('name', deckName)
                .eq('system_id', systemId)
                .single()

            if (!deck) return res.status(404).json('Deck not found. Make sure you are using the correct deck name')

            await supabase.from('flashcards').delete().eq('deck_id', deck.id)

            let chunks;
            if (intentData.file_names?.length > 0) {
                const { data } = await supabase
                    .from('chunks')
                    .select('*')
                    .eq('system_id', systemId)
                    .or(intentData.file_names.map(n => `file_name.ilike.%${n}%`).join(','))
                chunks = data
            } else {
                const embeddedResponse = await embedQuery(deckName)
                const embeddedQuery = embeddedResponse.data[0].embedding
                const { data } = await supabase.rpc('match_chunks', {
                    query_embedding: embeddedQuery,
                    match_system_id: systemId,
                    match_count: 20
                })
                chunks = data
            }

            const content = chunks.map(c => c.content).join('\n\n')
            const raw = await makeFlashcards(content, deckName)
            const parsed = JSON.parse(raw)
            await saveFlashcards(parsed.cards, deck.id)

            return res.json({ type: 'flashcard', answer: 'Made deck' + deck.name, deck_id: deck.id, deck_name: deckName, cards: parsed.cards })
        }

        if (intent === 'delete_deck') {
            const { error } = await supabase
                .from('decks')
                .delete()
                .eq('name', deckName)
                .eq('system_id', systemId)

            if (error) return res.status(500).json({error: { message: error.message } })
            return res.json({ type: 'deck_deleted', answer: "Deck deleted", deck_name: deckName })
        }

        if (intent === 'flashcard') {
            let chunks;
            if (intentData.file_names?.length > 0) {
                const { data } = await supabase
                    .from('chunks')
                    .select('*')
                    .eq('system_id', systemId)
                    .or(intentData.file_names.map(n => `file_name.ilike.%${n}%`).join(','))
                chunks = data
            } else {
                const embeddedResponse = await embedQuery(query)
                const embeddedQuery = embeddedResponse.data[0].embedding
                const { data, error } = await supabase.rpc('match_chunks', {
                    query_embedding: embeddedQuery,
                    match_system_id: systemId,
                    match_count: 20
                })
                if (error) return res.status(500).json({error: { message: error.message } })
                chunks = data
            }

            const content = chunks.map(c => c.content).join('\n\n')
            const raw = await makeFlashcards(content, query)
            const parsed = JSON.parse(raw)

            const name = deckName || query.slice(0, 30)
            const deckId = await getOrCreateDeck(name, systemId, userId)
            await supabase.from('flashcards').delete().eq('deck_id', deckId)
            await saveFlashcards(parsed.cards, deckId)

            return res.json({ type: 'flashcard', answer: 'Made deck' + name, deck_id: deckId, deck_name: name, cards: parsed.cards })
        }

        if (intent === 'audio_notes' || intent === 'asmr_notes') {
            const mode = intent === 'asmr_notes' ? 'asmr' : 'normal'

            let chunks;
            if (intentData.file_names?.length > 0) {
                const { data } = await supabase
                    .from('chunks')
                    .select('*')
                    .eq('system_id', systemId)
                    .or(intentData.file_names.map(n => `file_name.ilike.%${n}%`).join(','))
                chunks = data
            } else {
                const embeddedResponse = await embedQuery(query)
                const embeddedQuery = embeddedResponse.data[0].embedding
                const { data, error } = await supabase.rpc('match_chunks', {
                    query_embedding: embeddedQuery,
                    match_system_id: systemId,
                    match_count: 20
                })
                if (error) return res.status(500).json({ error: { message: error.message } })
                chunks = data
            }

            const content = chunks.map(c => c.content).join('\n\n')
            const audioInput = await formatAudio(content, query)
            const audio = await makeAudio(audioInput, mode)

            const audioSegments = []
            for await (const segment of audio) {
                audioSegments.push(segment)
            }
            const audioBuffer = Buffer.concat(audioSegments)

            const title = await nameAudio(query)
            const slug = title.replace(/\s+/g, '_')
            const filePath = `${userId}/${systemId}/${mode}/${slug}.mp3`

            const { error: uploadError } = await supabase.storage
                .from('audio')
                .upload(filePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

            if (uploadError) return res.status(500).json({ error: { message: uploadError.message } })

            return res.json({ type: 'audio_notes', answer: `Audio notes created: ${title}`, file_path: filePath, mode })
        }


        if (intent === 'file_query') {
            const fileNames = intentData.file_names

            if (!fileNames || fileNames.length === 0) {
                // user is asking WHICH file covers a topic — do vector search and return matching file names
                const embeddedResponse = await embedQuery(query)
                const embeddedQuery = embeddedResponse.data[0].embedding
                const { data, error } = await supabase.rpc('match_chunks', {
                    query_embedding: embeddedQuery,
                    match_system_id: systemId,
                    match_count: 10
                })
                if (error) return res.status(500).json({ error: { message: error.message } })
                if (!data || data.length === 0) return res.json({ answer: "I couldn't find any relevant files in your documents.", sources: [] })

                const uniqueFiles = [...new Set(data.map(c => c.file_name))]
                const fileNamesOnly = [...new Set(data.map(c => c.file_name.split('/')[2]))]
                
                return res.json({ 
                    answer: `The following files seem most relevant:\n\n${fileNamesOnly.map(f => `- ${f}`).join('\n')}`,
                    sources: uniqueFiles
                })
            }

            // existing code for when file_names is present
            const { data, error } = await supabase
                .from('chunks')
                .select('*')
                .eq('system_id', systemId)
                .or(fileNames.map(name => `file_name.ilike.%${name}%`).join(','))

            if (error) return res.status(500).json({ error: { message: error.message } })
            if (!data || data.length === 0) return res.json({ answer: "I couldn't find any files matching that name in your documents.", sources: [] })

            res.setHeader('Content-Type', 'text/plain')
            res.setHeader('Transfer-Encoding', 'chunked')
            await makeResponse(data, query, 'topic', (delta) => res.write(delta))
            res.end()
            return
        }


        // normal question queries
        if (intent === 'all') {
            const allchunks = await supabase
                .from('chunks')
                .select('*')
                .eq('system_id', systemId)
            
            if (allchunks.error) return res.status(500).json({error: { message: allchunks.error.message }} )

            res.setHeader('Content-Type', 'text/plain')
            res.setHeader('Transfer-Encoding', 'chunked')

            await makeResponse(allchunks.data, query, 'all', (delta) => {
                res.write(delta)
            })
            res.end()
        }

        else if (intent === 'topic') {
            const embeddedResponse = await embedQuery(query)
            const embeddedQuery = embeddedResponse.data[0].embedding
            const { data, error } = await supabase.rpc('match_chunks', {
                query_embedding: embeddedQuery,
                match_system_id: systemId,
                match_count: 10
            })
            if (error) return res.status(500).json({error: { message: error.message } })

            res.setHeader('Content-Type', 'text/plain')
            res.setHeader('Transfer-Encoding', 'chunked')

            await makeResponse(data, query, 'topic', (delta) => {
                res.write(delta)
            })
            res.end();
        } else {
        // normal search
            const embeddedReponse = await embedQuery(query);
            const embeddedQuery = embeddedReponse.data[0].embedding;

            const { data, error } = await supabase.rpc('match_chunks', {
                query_embedding: embeddedQuery,
                match_system_id: systemId,
                match_count: 5
            })
            if (error) return res.status(500).send({error: { message: error.message } });

            //const content = data.map(chunk => chunk.content);
            //const fileName = data.map(chunk => chunk.file_name);
            
            const raw = await makeResponse(data, query, intent);
            console.log(raw)
            const parsed = JSON.parse(raw);
            //console.log(parsed.sources)
            res.json({ answer: parsed.answer, sources: parsed.sources_used })
        }

       

    } catch (error) {
        res.status(500).json({error: { message: error.message } });
    }
    
})




// running
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});