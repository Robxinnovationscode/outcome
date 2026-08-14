import { getEmbedding } from './embeddingService.js';
import { ingestEmbedding, queryTopK, fetchAllForUser } from './vectorStoreService.js';
// use global fetch (Node 18+)

export async function ingestTextForRag({ userId = 'default_user', sourceId = null, text = '' }) {
  const embedding = await getEmbedding(text);
  return ingestEmbedding({ userId, sourceId, text, embedding });
}

// expose callLLM for agent usage
export async function callLLM(prompt, maxTokens = 512) {
  if (process.env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
        max_tokens: maxTokens
      })
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content || '';
  }
  return prompt.slice(0, Math.min(1000, prompt.length));
}

export async function queryRag({ userId = 'default_user', query = '', k = 4 }) {
  const qEmb = await getEmbedding(query);
  const results = await queryTopK({ userId, queryEmbedding: qEmb, k });
  const contextText = results.results.map(r => `- ${r.text}`).join('\n');

  const prompt = `You are a finance assistant. Summarize the following user transaction excerpts in concise bullets and then produce a 3-sentence overall summary.\n\nContext:\n${contextText}\n\nUser Query: ${query}`;
  const summary = await callLLM(prompt, 512);
  return { results: results.results, summary };
}

export async function summarizeFullHistory({ userId = 'default_user' }) {
  const items = await fetchAllForUser(userId);
  const combined = items.map(i => i.text).join('\n');
  const prompt = `You are a finance analyst. Create a readable summary of the user's transaction history below. Include total transactions, top 3 spending categories, and a 3-sentence financial health summary.\n\n${combined}`;
  const summary = await callLLM(prompt, 1024);
  return { count: items.length, summary };
}
