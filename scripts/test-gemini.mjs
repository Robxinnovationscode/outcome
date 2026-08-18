import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
console.log('Testing Gemini API key:', key.slice(0, 8) + '...');

const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
for (const model of models) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello, respond with OK' }] }]
      })
    });
    console.log(`[${model}] Status:`, res.status);
    const data = await res.json();
    if (res.ok) {
      console.log(`[${model}] Response:`, data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
    } else {
      console.log(`[${model}] Error:`, data?.error?.message || data);
    }
  } catch (err) {
    console.log(`[${model}] Exception:`, err.message);
  }
}
