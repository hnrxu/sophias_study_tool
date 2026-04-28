import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from 'multer';
import { parsePdf, splitPdf, parsePdfByPage } from './utils/pdfparser.js'
import { chunkText } from './utils/chunker.js'
import { insertChunks } from './utils/inserter.js'
import { classifyResponse, embedChunks, embedQuery, makeResponse } from "./api/openaiClient.js";
import { supabase } from './api/sbClient.js';



dotenv.config();

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;



// parses the formdata
const parser = multer({ storage: multer.memoryStorage() });

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
                    await supabase.storage
                        .from('files')
                        .upload(path, page.buffer, { contentType: 'application/pdf' })
                }

                const parsedPages = await parsePdfByPage(file)
                for (const page of parsedPages) {
                    const pagePath = `${userId}/${systemId}/${file.originalname}/page-${page.pageNumber}.pdf`
                    const chunks = chunkText(page.text)
                    const embeddings = await embedChunks(chunks)
                    await insertChunks(chunks, embeddings, userId, systemId, pagePath);
                }
    
                //console.log(chunks);
            }
        }

        res.send("files received");

    } catch (error) {
        res.status(500).send(error.message);
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

        if (!system) return res.status(403).send('Unauthorized');

        // first classify query type
        const intent = (await classifyResponse(query)).output_text.trim().toLowerCase();
        console.log(intent);

        if (intent === 'broad') {
            // fetch all chunks and summarize
            const allchunks = await supabase
                                .from('chunks')
                                .select("*")
                                .eq('system_id', systemId);
            
            if (allchunks.error) return res.status(500).send(error.message);
            //const response = await makeResponse(allchunks.data, query, intent);
            
            const response = await makeResponse(allchunks.data, query, intent)
            const sources = [...new Set(allchunks.data.map(c => c.file_name))]
            res.json({ answer: response, sources: sources })
            


        } else {
        // normal search
            const embeddedReponse = await embedQuery(query);
            const embeddedQuery = embeddedReponse.data[0].embedding;

            const { data, error } = await supabase.rpc('match_chunks', {
                query_embedding: embeddedQuery,
                match_system_id: systemId,
                match_count: 5
            })
            if (error) return res.status(500).send(error.message);

            //const content = data.map(chunk => chunk.content);
            //const fileName = data.map(chunk => chunk.file_name);
            console.log(data)
            const response = await makeResponse(data, query, intent)
            const sources = [...new Set(data.map(c => c.file_name))]
            res.json({ answer: response, sources: sources })
        }

       

    } catch (error) {
        res.status(500).send(error.message);
    }
    
})




// running
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});