import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Transcribe Audio to Text (Speech-to-Text)
 * Supports:
 * 1. OpenAI Whisper API (if OPENAI_API_KEY is present)
 * 2. Groq Whisper API (if GROQ_API_KEY is present)
 * 3. Google Gemini Speech-to-Text (if GEMINI_API_KEY is present)
 * 4. Text pass-through (if file is already a string)
 *
 * NOTE: The previous hardcoded fallback ("Spent 500 rupees on groceries") has been
 * removed. When no STT provider is configured and a real audio file is sent,
 * this returns a null transcript with an explanatory error so the UI can ask
 * the user to try again instead of logging fake data.
 */
export async function transcribeAudio({ file, audioBase64, language = 'en' }) {
  // Pass-through: if caller already has a text transcript
  if (typeof file === 'string') {
    return { transcript: file, confidence: 1.0, stt_provider: 'text_input' };
  }

  const getAudioBuffer = () => {
    if (file) {
      return file.buffer ? file.buffer : fs.readFileSync(file.path);
    }
    if (audioBase64) {
      const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    }
    return null;
  };

  // 1. OpenAI Whisper Integration
  if (process.env.OPENAI_API_KEY && (file || audioBase64)) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const formData = new FormData();
      const buffer = getAudioBuffer();
      const audioBlob = new Blob([buffer], { type: file?.mimetype || 'audio/wav' });

      formData.append('file', audioBlob, file?.originalname || 'audio.wav');
      formData.append('model', 'whisper-1');
      if (language) formData.append('language', language.split('-')[0]);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        return {
          transcript: data.text,
          confidence: 0.96,
          stt_provider: 'openai_whisper'
        };
      }
    } catch (err) {
      console.warn('⚠️ OpenAI Whisper API call failed, trying next provider:', err.message);
    }
  }

  // 2. Groq Whisper Integration
  if (process.env.GROQ_API_KEY && (file || audioBase64)) {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      const formData = new FormData();
      const buffer = getAudioBuffer();
      const audioBlob = new Blob([buffer], { type: file?.mimetype || 'audio/wav' });

      formData.append('file', audioBlob, file?.originalname || 'audio.wav');
      formData.append('model', 'whisper-large-v3-turbo');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        return {
          transcript: data.text,
          confidence: 0.97,
          stt_provider: 'groq_whisper'
        };
      }
    } catch (err) {
      console.warn('⚠️ Groq Whisper API call failed, trying next provider:', err.message);
    }
  }

  // 3. Google Gemini Speech-to-Text (gemini-1.5-flash supports audio natively)
  if (process.env.GEMINI_API_KEY && (file || audioBase64)) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const buffer = getAudioBuffer();
      if (buffer) {
        const audioB64 = buffer.toString('base64');
        const mimeType = file?.mimetype || 'audio/wav';

        const requestBody = {
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audioB64
                }
              },
              {
                text: 'Please transcribe the speech in this audio file. Return only the transcribed text, nothing else. If no speech is detected, return an empty string.'
              }
            ]
          }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 500
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

        if (response.ok) {
          const data = await response.json();
          const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (transcript) {
            return {
              transcript,
              confidence: 0.93,
              stt_provider: 'gemini_flash'
            };
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Gemini STT failed:', err.message);
    }
  }

  // 4. No STT provider configured — return null transcript so the UI
  //    can instruct the user to speak again, NOT log a fake transaction.
  console.warn('⚠️ No STT provider configured (OPENAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY). Returning null transcript.');
  return {
    transcript: null,
    confidence: 0,
    stt_provider: 'no_provider_configured',
    error: 'No STT provider is configured on this server. Set OPENAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY. The browser Web Speech API (microphone button) does not require a server-side key.'
  };
}
