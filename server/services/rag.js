import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import {
  updateDocumentStatus, insertChunksBatch, getAllChunksWithEmbeddings
} from '../db/index.js';

const execFileAsync = promisify(execFile);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Text Extraction ---

async function extractText(filePath, fileType) {
  if (fileType === 'application/pdf' || filePath.endsWith('.pdf')) {
    // Try pdftotext first (install with: brew install poppler)
    // Falls back to pdf-parse if pdftotext is not available
    try {
      const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], {
        maxBuffer: 50 * 1024 * 1024
      });
      return stdout;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // only fall back if binary not found
      console.log('[RAG] pdftotext not found, falling back to pdf-parse');
    }
    const buffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  return fs.promises.readFile(filePath, 'utf-8');
}

// --- Chunking ---

export function chunkDocument(text, chunkSize = 1500, overlap = 300) {
  const chunks = [];
  if (!text || text.length === 0) return chunks;
  
  // Simple and efficient chunking
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length <= chunkSize) {
    chunks.push(cleaned);
    return chunks;
  }

  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    // Only adjust boundaries if not at the end
    if (end < cleaned.length) {
      // Look for paragraph break (limit search to prevent excessive string scanning)
      const searchStart = Math.max(0, end - overlap - 100);
      const searchSection = cleaned.substring(searchStart, end);
      const paragraphIdx = searchSection.lastIndexOf('\n\n');
      
      if (paragraphIdx > 0 && paragraphIdx > (end - start) * 0.4) {
        end = searchStart + paragraphIdx;
      } else {
        // Fall back to sentence boundary
        const sentenceIdx = searchSection.lastIndexOf('. ');
        if (sentenceIdx > 0 && sentenceIdx > (end - start) * 0.4) {
          end = searchStart + sentenceIdx + 1;
        }
      }
    }

    if (end <= start) end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.substring(start, end).trim();

    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    // If we reached the end of the document, stop
    if (end >= cleaned.length) break;

    // Ensure progress
    start = Math.min(end - overlap, start + Math.ceil(chunkSize * 0.7));
    if (start >= cleaned.length) break;
  }

  return chunks;
}

const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001';

async function generateEmbedding(text) {
  try {
    const res = await fetch(
      `${EMBED_BASE}:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: text.substring(0, 8000) }] } })
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.embedding?.values ?? [];
  } catch (err) {
    console.warn(`[RAG] Warning: embedding API error: ${err.message}`);
    return [];
  }
}

async function generateEmbeddings(texts) {
  try {
    const res = await fetch(
      `${EMBED_BASE}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: text.substring(0, 8000) }] }
          }))
        })
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.embeddings ?? []).map(e => e.values ?? []);
  } catch (err) {
    console.warn(`[RAG] Warning: embedding API error: ${err.message}`);
    return texts.map(() => []);
  }
}

// --- Cosine Similarity ---

function cosineSimilarity(a, b) {
  if (a.length === 0 || b.length === 0) return 0; // Handle empty embeddings
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
    console.log(`[RAG] Starting processing for document ${docId}`);
    let text = await extractText(filePath, fileType);
    console.log(`[RAG] Extracted text length: ${text.length}`);

    if (!text || text.trim().length === 0) {
      console.log(`[RAG] No text extracted`);
      updateDocumentStatus(docId, 'error', 0, 'Could not extract text from file');
      return;
    }

    // Cap text to 100KB for processing
    const MAX_TEXT_SIZE = 100 * 1024;
    if (text.length > MAX_TEXT_SIZE) {
      console.warn(`[RAG] Document ${docId} exceeds max size. Truncating from ${text.length} to ${MAX_TEXT_SIZE}`);
      text = text.substring(0, MAX_TEXT_SIZE);
    }

    console.log(`[RAG] Calling chunkDocument with ${text.length} chars`);
    const chunks = chunkDocument(text);
    console.log(`[RAG] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      updateDocumentStatus(docId, 'error', 0, 'No meaningful text chunks found');
      return;
    }

    // Allow up to 50 chunks for processing
    const MAX_CHUNKS = 50;
    if (chunks.length > MAX_CHUNKS) {
      console.warn(`[RAG] Limiting chunks from ${chunks.length} to ${MAX_CHUNKS}`);
      chunks.length = MAX_CHUNKS;
    }

    // Process chunks in batches of 5 with individual timeouts
    let chunkCount = 0;
    const BATCH_SIZE = 5;
    console.log(`[RAG] Starting embedding generation in batches of ${BATCH_SIZE}`);

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[RAG] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, size: ${batch.length}`);
      
      try {
        // Add timeout for batch
        const embeddingPromise = generateEmbeddings(batch);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Embedding generation timeout after 30s')), 30000)
        );
        
        const embeddings = await Promise.race([embeddingPromise, timeoutPromise]);
        console.log(`[RAG] Got embeddings for batch, size: ${embeddings.length}`);

        // Insert batch records
        const batchRecords = batch.map((content, idx) => ({
          id: uuidv4(),
          documentId: docId,
          chunkIndex: i + idx,
          content: content,
          embedding: embeddings[idx]
        }));
        
        insertChunksBatch(batchRecords);
        chunkCount += batch.length;
        console.log(`[RAG] Inserted batch, total chunks so far: ${chunkCount}`);
        
        // Force garbage collection after each batch
        if (global.gc) {
          global.gc();
        }
      } catch (batchError) {
        console.error(`[RAG] Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError.message);
        // Continue with next batch instead of failing entire document
      }
    }

    console.log(`[RAG] All batches processed, updating status`);
    updateDocumentStatus(docId, 'ready', chunkCount);
    console.log(`[RAG] Document ${docId} processed successfully: ${chunkCount} chunks`);
  } catch (error) {
    console.error(`[RAG] Error processing document ${docId}:`, error.message);
    updateDocumentStatus(docId, 'error', 0, error.message);
  }
}

// --- Search ---

export async function searchDocuments(query, topK = 8) {
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
  const topResults = scored.slice(0, topK).filter(r => r.score > 0.2);

  // Expand results with neighboring chunks to capture content split across boundaries
  const includedKeys = new Set(topResults.map(r => `${r.documentId}:${r.chunkIndex}`));
  const neighborChunks = [];

  for (const result of topResults) {
    // Include the next chunk (index + 1) to capture lists/details after a heading
    const nextIndex = result.chunkIndex + 1;
    const key = `${result.documentId}:${nextIndex}`;
    if (!includedKeys.has(key)) {
      const neighbor = allChunks.find(
        c => c.document_id === result.documentId && c.chunk_index === nextIndex
      );
      if (neighbor) {
        includedKeys.add(key);
        neighborChunks.push({
          content: neighbor.content,
          score: result.score * 0.9, // slightly lower score to keep ordering sensible
          documentName: result.documentName,
          documentId: result.documentId,
          chunkIndex: nextIndex
        });
      }
    }
  }

  const finalResults = [...topResults, ...neighborChunks]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK + 4); // allow a few extra slots for neighbor chunks

  const col = { rank: 4, score: 7, doc: 30, idx: 4, tag: 8, preview: 60 };
  const hr = `|-${'-'.repeat(col.rank)}-|-${'-'.repeat(col.score)}-|-${'-'.repeat(col.doc)}-|-${'-'.repeat(col.idx)}-|-${'-'.repeat(col.tag)}-|-${'-'.repeat(col.preview)}-|`;
  const pad = (s, n) => String(s).substring(0, n).padEnd(n);
  console.log(`\n[RAG] Query: "${query}"  (db=${allChunks.length} top=${topResults.length} +neighbors=${neighborChunks.length} final=${finalResults.length})`);
  console.log(`| ${pad('#',col.rank)} | ${pad('Score',col.score)} | ${pad('Document',col.doc)} | ${pad('Idx',col.idx)} | ${pad('Type',col.tag)} | ${pad('Preview',col.preview)} |`);
  console.log(hr);
  finalResults.forEach((r, i) => {
    const tag = neighborChunks.includes(r) ? 'neighbor' : 'match';
    const preview = r.content.substring(0, col.preview).replace(/\n/g, ' ');
    console.log(`| ${pad(i+1,col.rank)} | ${pad(r.score.toFixed(4),col.score)} | ${pad(r.documentName,col.doc)} | ${pad(r.chunkIndex,col.idx)} | ${pad(tag,col.tag)} | ${pad(preview,col.preview)} |`);
  });
  console.log();

  return {
    results: finalResults,
    message: finalResults.length > 0
      ? `Found ${finalResults.length} relevant passages`
      : 'No sufficiently relevant passages found'
  };
}
