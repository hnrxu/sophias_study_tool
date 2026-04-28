import { createRequire } from 'module'
import { PDFDocument } from 'pdf-lib'


const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

export const parsePdf = async (file) => {
    const parsedFile = await pdf(file.buffer);
    const parsedText = parsedFile.text.replace(/\s+/g, ' ').trim();
    return parsedText;
}

export const parsePdfByPage = async (file) => {
    const pages = []
    let pageIndex = 0

    await pdf(file.buffer, {
        pagerender: async (pageData) => {
        const text = await pageData.getTextContent()
        const pageText = text.items.map(item => item.str).join(' ')
        pages.push({ pageNumber: pageIndex + 1, text: pageText })
        pageIndex++;
        }
    })

    return pages;
}

export const splitPdf = async (buffer) => {
    const pdfDoc = await PDFDocument.load(buffer)
    const pages = []
    
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const newPdf = await PDFDocument.create()
        const [page] = await newPdf.copyPages(pdfDoc, [i])
        newPdf.addPage(page)
        const pageBuffer = await newPdf.save()
        pages.push({ pageNumber: i + 1, buffer: pageBuffer })
    }
    
    return pages;
}