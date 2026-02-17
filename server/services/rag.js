import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  updateDocumentStatus, insertChunksBatch, getAllChunksWithEmbeddings
} from '../db/index.js';

// Polyfill DOMMatrix for pdfjs-dist (used by pdf-parse) in Node.js
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      const values = new Float64Array(16);
      values[0] = values[5] = values[10] = values[15] = 1;
      if (Array.isArray(init)) {
        for (let i = 0; i < Math.min(init.length, 16); i++) values[i] = init[i];
      }
      const props = ['a','b','c','d','e','f'];
      const map = [0,1,4,5,12,13];
      for (let i = 0; i < 6; i++) this[props[i]] = values[map[i]];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) this[`m${r+1}${c+1}`] = values[r*4+c];
      this.is2D = true;
      this.isIdentity = !init;
    }
  };
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Text Extraction ---

async function extractText(filePath, fileType) {
  if (fileType === 'application/pdf' || filePath.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  // .txt, .md — read as UTF-8
  return fs.readFileSync(filePath, 'utf-8');
}

// --- Chunking ---

export function chunkDocument(text, chunkSize = 1500, overlap = 300) {
  const chunks = [];
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    // Try to break at paragraph boundary
    if (end < cleaned.length) {
      const paragraphBreak = cleaned.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + chunkSize * 0.5) {
        end = paragraphBreak;
      } else {
        // Fall back to sentence boundary
        const sentenceBreak = cleaned.lastIndexOf('. ', end);
        if (sentenceBreak > start + chunkSize * 0.5) {
          end = sentenceBreak + 1;
        }
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= cleaned.length) break;
  }

  return chunks;
}

// --- Embedding ---

async function generateEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function generateEmbeddings(texts) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.batchEmbedContents({
    requests: texts.map(text => ({
      content: { parts: [{ text }] }
    }))
  });
  return result.embeddings.map(e => e.values);
}

// --- Cosine Similarity ---

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- Process Document ---

export async function processDocument(docId, filePath, fileType) {
  try {
    const text = await extractText(filePath, fileType);

    if (!text || text.trim().length === 0) {
      updateDocumentStatus(docId, 'error', 0, 'Could not extract text from file');
      return;
    }

    const chunks = chunkDocument(text);

    if (chunks.length === 0) {
      updateDocumentStatus(docId, 'error', 0, 'No meaningful text chunks found');
      return;
    }

    // Embed in batches of 100
    const BATCH_SIZE = 100;
    const allChunkRecords = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddings(batch);

      for (let j = 0; j < batch.length; j++) {
        allChunkRecords.push({
          id: uuidv4(),
          documentId: docId,
          chunkIndex: i + j,
          content: batch[j],
          embedding: embeddings[j]
        });
      }
    }

    insertChunksBatch(allChunkRecords);
    updateDocumentStatus(docId, 'ready', allChunkRecords.length);
    console.log(`[RAG] Document ${docId} processed: ${allChunkRecords.length} chunks`);
  } catch (error) {
    console.error(`[RAG] Error processing document ${docId}:`, error);
    updateDocumentStatus(docId, 'error', 0, error.message);
  }
}

// --- Search ---

export async function searchDocuments(query, topK = 5) {
  const allChunks = getAllChunksWithEmbeddings();

  if (allChunks.length === 0) {
    return { results: [], message: 'No documents in knowledge base' };
  }

  const queryEmbedding = await generateEmbedding(query);

  const scored = allChunks.map(chunk => {
    const chunkEmbedding = JSON.parse(chunk.embedding);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return {
      content: chunk.content,
      score,
      documentName: chunk.document_name,
      documentId: chunk.document_id,
      chunkIndex: chunk.chunk_index
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, topK).filter(r => r.score > 0.3);

  return {
    results: topResults,
    message: topResults.length > 0
      ? `Found ${topResults.length} relevant passages`
      : 'No sufficiently relevant passages found'
  };
}
