import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Transcribe Audio to Text (Speech-to-Text)
 * Supports:
 * 1. Google Gemini Flash Native Audio STT (if GEMINI_API_KEY is present)
 * 2. OpenAI Whisper API (if OPENAI_API_KEY is present)
 * 3. Groq Whisper API (if GROQ_API_KEY is present)
 * 4. Text pass-through (if file is already a string)
 */
export async function transcribeAudio({ file, audioBase64, language = 'en' }) {
  // Pass-through: if caller already passed a text transcript
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

  // 1. Google Gemini Flash Native Audio Speech-to-Text
  const geminiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  if (geminiKey && (file || audioBase64)) {
    try {
      const buffer = getAudioBuffer();
      if (buffer && buffer.length > 0) {
        const audioB64 = buffer.toString('base64');
        let mimeType = file?.mimetype || 'audio/wav';
        if (mimeType.includes('m4a') || mimeType.includes('mp4')) mimeType = 'audio/mp4';
        else if (mimeType.includes('webm')) mimeType = 'audio/webm';
        else if (mimeType.includes('aac')) mimeType = 'audio/aac';
        else if (mimeType.includes('ogg')) mimeType = 'audio/ogg';
        else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) mimeType = 'audio/mp3';

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
                text: 'Please transcribe the speech in this audio file accurately. Return only the exact transcribed words, nothing else. If the audio is silent or contains no intelligible words, return SILENT.'
              }
            ]
          }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 300
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

        if (response.ok) {
          const data = await response.json();
          let transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (transcript === 'SILENT' || transcript.toLowerCase().includes('silent') || transcript === '""' || transcript === "''") {
            transcript = '';
          }

          if (transcript) {
            return {
              transcript,
              confidence: 0.95,
              stt_provider: 'gemini_flash_native_audio'
            };
          }
        } else {
          const errData = await response.text();
          console.warn('⚠️ Gemini STT status not ok:', response.status, errData);
        }
      }
    } catch (err) {
      console.warn('⚠️ Gemini STT exception:', err.message);
    }
  }

  // 2. OpenAI Whisper Integration
  if (process.env.OPENAI_API_KEY && (file || audioBase64)) {
    try {
      const apiKey = process.env.OPENAI_API_KEY.trim();
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
        if (data.text && data.text.trim()) {
          return {
            transcript: data.text.trim(),
            confidence: 0.96,
            stt_provider: 'openai_whisper'
          };
        }
      }
    } catch (err) {
      console.warn('⚠️ OpenAI Whisper API call failed:', err.message);
    }
  }

  // 3. Groq Whisper Integration
  if (process.env.GROQ_API_KEY && (file || audioBase64)) {
    try {
      const apiKey = process.env.GROQ_API_KEY.trim();
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
        if (data.text && data.text.trim()) {
          return {
            transcript: data.text.trim(),
            confidence: 0.97,
            stt_provider: 'groq_whisper'
          };
        }
      }
    } catch (err) {
      console.warn('⚠️ Groq Whisper API call failed:', err.message);
    }
  }

  // 4. No Speech detected or no STT keys
  return {
    transcript: null,
    confidence: 0,
    stt_provider: 'gemini_fallback',
    error: "I couldn't detect clear speech in that recording. Please speak and try again!"
  };
}
