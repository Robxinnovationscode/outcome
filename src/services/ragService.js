import dotenv from 'dotenv';
import { getEmbedding } from './embeddingService.js';
import { ingestEmbedding, queryTopK, fetchAllForUser } from './vectorStoreService.js';

dotenv.config();

export async function ingestTextForRag({ userId = 'default_user', sourceId = null, text = '' }) {
  const embedding = await getEmbedding(text);
  return ingestEmbedding({ userId, sourceId, text, embedding });
}

// Expose callLLM for agent usage with Gemini and OpenAI support
export async function callLLM(prompt, maxTokens = 512) {
  // 1. Google Gemini Flash
  const geminiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.2
            }
          })
        }
      );
      if (res.ok) {
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('⚠️ Gemini LLM call failed:', e.message);
    }
  }

  // 2. OpenAI fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: prompt }],
          max_tokens: maxTokens
        })
      });
      if (res.ok) {
        const d = await res.json();
        return d.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (e) {
      console.warn('⚠️ OpenAI LLM call failed:', e.message);
    }
  }

  // Deterministic fallback
  return prompt.slice(0, Math.min(1000, prompt.length));
}

export async function queryRag({ userId = 'default_user', query = '', k = 4 }) {
  const qEmb = await getEmbedding(query);
  const results = await queryTopK({ userId, queryEmbedding: qEmb, k });
  const contextText = results.results.map(r => `- ${r.text}`).join('\n');

  const prompt = `You are a helpful personal finance AI assistant. Answer the user question based on their transaction history below. If no history is found, give a polite answer.\n\nTransactions:\n${contextText || 'No previous transactions found.'}\n\nUser Question: ${query}`;
  const summary = await callLLM(prompt, 512);
  return { results: results.results, summary, answer: summary };
}

export async function summarizeFullHistory({ userId = 'default_user' }) {
  const items = await fetchAllForUser(userId);
  const combined = items.map(i => i.text).join('\n');
  const prompt = `You are a financial advisor. Create a concise summary of the user's spending history below. Mention total recorded records, top spend categories, and 2 helpful tips.\n\nTransactions:\n${combined || 'No transactions recorded yet.'}`;
  const summary = await callLLM(prompt, 1024);
  return { count: items.length, summary, answer: summary };
}
