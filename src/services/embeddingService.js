// Return embedding vector for given text. Uses OpenAI if available, otherwise deterministic fallback.
export async function getEmbedding(text) {
  const normalized = (text || '').trim();
  if (!normalized) return null;

  // OpenAI Embeddings
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: normalized })
      });
      if (res.ok) {
        const data = await res.json();
        return data.data[0].embedding;
      }
    } catch (err) {
      console.warn('OpenAI embedding failed, falling back:', err.message);
    }
  }

  // Deterministic fallback embedding (hashed n-gram counts vector)
  const vec = new Array(256).fill(0);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    vec[code % vec.length] += 1;
  }
  // normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0) || 1);
  return vec.map(v => v / norm);
}
