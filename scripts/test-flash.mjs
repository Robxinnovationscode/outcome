import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

for (const m of models) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with ONLY the word SUCCESS' }] }]
      })
    });
    const data = await res.json();
    console.log(m, res.status, data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || data?.error?.message);
  } catch (e) {
    console.log(m, 'Error:', e.message);
  }
}
