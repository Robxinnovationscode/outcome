import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
const data = await res.json();
console.log('Available models:');
if (data.models) {
  for (const m of data.models) {
    if (m.supportedGenerationMethods?.includes('generateContent')) {
      console.log(m.name, m.displayName);
    }
  }
} else {
  console.log(data);
}
