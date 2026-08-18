import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
const m = 'gemini-3.5-flash-lite';

console.log('Calling', m);
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: 'Hello' }] }]
  })
});
const data = await res.json();
console.log(m, res.status, JSON.stringify(data));
