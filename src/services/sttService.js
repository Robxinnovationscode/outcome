import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

/**
 * Detect correct audio MIME type from Buffer magic bytes, filename, and mimetype string
 */
function detectAudioMimeType(buffer, file) {
  const origName = (file?.originalname || file?.name || '').toLowerCase();
  const rawMime = (file?.mimetype || file?.type || '').toLowerCase();

  // 1. Check Magic Bytes in Buffer header
  if (buffer && buffer.length >= 8) {
    // MP4 / M4A: starts with ftyp at offset 4
    if (buffer.toString('ascii', 4, 8) === 'ftyp' || buffer.toString('ascii', 0, 4) === 'ftyp') {
      return 'audio/mp4';
    }
    // WAV: starts with RIFF
    if (buffer.toString('ascii', 0, 4) === 'RIFF') {
      return 'audio/wav';
    }
    // OGG: starts with OggS
    if (buffer.toString('ascii', 0, 4) === 'OggS') {
      return 'audio/ogg';
    }
    // MP3: ID3 header or sync word
    if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'audio/mp3';
    }
    // WebM / EBML: 0x1A 0x45 0xDF 0xA3
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return 'audio/webm';
    }
    // AAC: ADTS header 0xFFF1 or 0xFFF9
    if (buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9)) {
      return 'audio/aac';
    }
  }

  // 2. Check filename extension
  if (origName.endsWith('.m4a') || origName.endsWith('.mp4') || origName.endsWith('.3gp') || origName.endsWith('.caf')) {
    return 'audio/mp4';
  }
  if (origName.endsWith('.wav')) return 'audio/wav';
  if (origName.endsWith('.mp3')) return 'audio/mp3';
  if (origName.endsWith('.aac')) return 'audio/aac';
  if (origName.endsWith('.webm')) return 'audio/webm';
  if (origName.endsWith('.ogg')) return 'audio/ogg';

  // 3. Check mimetype string hints
  if (rawMime.includes('m4a') || rawMime.includes('mp4') || rawMime.includes('3gp') || rawMime.includes('caf')) {
    return 'audio/mp4';
  }
  if (rawMime.includes('wav')) return 'audio/wav';
  if (rawMime.includes('mp3') || rawMime.includes('mpeg')) return 'audio/mp3';
  if (rawMime.includes('aac')) return 'audio/aac';
  if (rawMime.includes('webm')) return 'audio/webm';
  if (rawMime.includes('ogg')) return 'audio/ogg';

  // Default fallback for mobile recordings
  return 'audio/mp4';
}

/**
 * Transcribe Audio to Text (Speech-to-Text)
 * Supports:
 * 1. Google Gemini Flash Native Audio STT (Tamil, Tanglish, Hindi, Hinglish, English)
 * 2. OpenAI Whisper API
 * 3. Groq Whisper API
 * 4. Text pass-through
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

  const buffer = getAudioBuffer();
  if (!buffer || buffer.length === 0) {
    return {
      transcript: null,
      confidence: 0,
      stt_provider: 'none',
      error: 'Audio buffer is empty. Please record again.'
    };
  }

  const mimeType = detectAudioMimeType(buffer, file);
  console.log(`🎙️ [STT] Processing audio buffer size=${buffer.length} bytes, detected MIME=${mimeType}`);

  // 1. Google Gemini Flash Native Audio Speech-to-Text
  const geminiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  if (geminiKey) {
    const audioB64 = buffer.toString('base64');
    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

    for (const modelName of modelsToTry) {
      try {
        const requestBody = {
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioB64
                }
              },
              {
                text: 'You are an accurate multilingual speech-to-text transcriber for a personal finance assistant. The user may speak in English, Tamil (தமிழ்), Tanglish (Tamil in English alphabet, e.g. "maligaiku 350 rooba kuduthen"), Hindi (हिंदी), or Hinglish (e.g. "sabzi ke liye 250 rupaye").\n\nInstructions:\n1. Transcribe the exact words spoken by the user.\n2. If spoken in Tanglish or Tamil, write the transcript faithfully.\n3. If the audio is silent or unintelligible noise, reply ONLY with the word: SILENT.\n4. Return ONLY the transcribed text, nothing else.'
              }
            ]
          }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 350
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

        if (response.ok) {
          const data = await response.json();
          let transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          console.log(`🎙️ [STT ${modelName} Raw Output]: "${transcript}"`);

          if (
            transcript.toUpperCase() === 'SILENT' ||
            transcript.toLowerCase().includes('silent') ||
            transcript === '""' ||
            transcript === "''" ||
            transcript === '.'
          ) {
            transcript = '';
          }

          if (transcript) {
            return {
              transcript,
              confidence: 0.95,
              stt_provider: `gemini_${modelName}`
            };
          }
        } else {
          const errData = await response.text();
          console.warn(`⚠️ Gemini STT (${modelName}) status ${response.status}:`, errData);
        }
      } catch (err) {
        console.warn(`⚠️ Gemini STT (${modelName}) exception:`, err.message);
      }
    }
  }

  // 2. OpenAI Whisper Integration Fallback
  if (process.env.OPENAI_API_KEY) {
    try {
      const apiKey = process.env.OPENAI_API_KEY.trim();
      const formData = new FormData();
      const audioBlob = new Blob([buffer], { type: mimeType });

      formData.append('file', audioBlob, file?.originalname || 'audio.m4a');
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

  // 3. Groq Whisper Integration Fallback
  if (process.env.GROQ_API_KEY) {
    try {
      const apiKey = process.env.GROQ_API_KEY.trim();
      const formData = new FormData();
      const audioBlob = new Blob([buffer], { type: mimeType });

      formData.append('file', audioBlob, file?.originalname || 'audio.m4a');
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

  // 4. No Speech detected
  return {
    transcript: null,
    confidence: 0,
    stt_provider: 'gemini_fallback',
    error: "I couldn't detect clear speech in that recording. Please speak and try again!"
  };
}
