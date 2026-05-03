import { createRequire } from 'module'
import { PDFDocument } from 'pdf-lib'

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
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




export const splitAudio = (buffer, mimetype, chunkMinutes = 10) => {
  return new Promise((resolve, reject) => {
    const mimeToExt = {
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/webm': 'webm',
      'video/webm': 'webm',
      'video/mp4': 'mp4',
    };
    const ext = mimeToExt[mimetype] || 'mp3';
    const tmpInput = path.join(os.tmpdir(), `input_${Date.now()}.${ext}`);
    fs.writeFileSync(tmpInput, buffer);

    // get duration first
    ffmpeg.ffprobe(tmpInput, (err, metadata) => {
      if (err) { fs.unlinkSync(tmpInput); return reject(err); }

      const duration = metadata.format.duration;
      const chunkSeconds = chunkMinutes * 60;
      const numChunks = Math.ceil(duration / chunkSeconds);
      const chunkBuffers = [];
      let completed = 0;

      for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSeconds;
        const tmpOutput = path.join(os.tmpdir(), `chunk_${Date.now()}_${i}.mp3`);

        ffmpeg(tmpInput)
          .setStartTime(start)
          .setDuration(chunkSeconds)
          .format('mp3')
          .on('end', () => {
            chunkBuffers[i] = fs.readFileSync(tmpOutput);
            fs.unlinkSync(tmpOutput);
            completed++;
            if (completed === numChunks) {
              fs.unlinkSync(tmpInput);
              resolve(chunkBuffers);
            }
          })
          .on('error', (err) => {
            fs.unlinkSync(tmpInput);
            reject(err);
          })
          .save(tmpOutput);
      }
    });
  });
};