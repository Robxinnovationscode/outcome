document.addEventListener('DOMContentLoaded', () => {
  const textForm = document.getElementById('text-form');
  const utteranceInput = document.getElementById('utterance-input');
  const sampleBtns = document.querySelectorAll('.chip-btn');
  const micBtn = document.getElementById('mic-btn');
  const micText = document.getElementById('mic-text');
  const recordingIndicator = document.getElementById('recording-indicator');

  const resType = document.getElementById('res-type');
  const resAmount = document.getElementById('res-amount');
  const resCategory = document.getElementById('res-category');
  const resDate = document.getElementById('res-date');
  const confidenceBadge = document.getElementById('confidence-badge');
  const confirmationText = document.getElementById('confirmation-text');
  const clarificationBanner = document.getElementById('clarification-banner');
  const clarificationMsg = document.getElementById('clarification-msg');
  const jsonOutput = document.getElementById('json-output');

  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let currentSessionId = null;

  // Check API status
  fetch('/api/voice/health')
    .then(res => res.json())
    .then(data => {
      console.log('API Status:', data);
      if (data.llm_enabled) console.log('LLM support detected.');
      // Note: `/api/voice/token` requires a Firebase ID token in Authorization header.
      console.log('Note: /api/voice/token requires Firebase ID token in Authorization header for production.');
    })
    .catch(err => console.error('Health check failed:', err));

  // Sample Chips Click Handler
  sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      utteranceInput.value = btn.dataset.sample;
      submitUtterance(btn.dataset.sample);
    });
  });

  // Form Submit Handler
  textForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitUtterance(utteranceInput.value);
  });

  // Submit Text Utterance to Backend API
  async function submitUtterance(text) {
    if (!text || text.trim() === '') return;

    const selectedModel = document.querySelector('input[name="integrationModel"]:checked').value;

    const payload = {
      text: text,
      model: selectedModel,
      sessionId: currentSessionId
    };

    try {
      const response = await fetch('/api/voice/process-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      renderResponse(data);
    } catch (error) {
      alert('API Error: ' + error.message);
    }
  }

  // Render Response into UI
  function renderResponse(data) {
    if (data.sessionId) currentSessionId = data.sessionId;

    jsonOutput.textContent = JSON.stringify(data, null, 2);

    confirmationText.textContent = data.confirmation_spoken || data.follow_up_question || 'Processed successfully';

    if (data.requires_clarification) {
      clarificationBanner.classList.remove('hidden');
      clarificationMsg.textContent = data.follow_up_question;
    } else {
      clarificationBanner.classList.add('hidden');
      currentSessionId = null; // Clear session once finished
    }

    const item = data.partial_parsed || data;

    resType.textContent = (item.transaction_type || 'N/A').toUpperCase();
    resAmount.textContent = item.amount ? `₹${item.amount}` : 'N/A';
    resCategory.textContent = item.category || 'N/A';
    resDate.textContent = item.date || 'N/A';

    const conf = item.confidence ? Math.round(item.confidence * 100) : '--';
    confidenceBadge.textContent = `Confidence: ${conf}%`;
  }

  // Microphone Web Speech / Audio Recording
  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN';

    micBtn.addEventListener('click', () => {
      if (!isRecording) {
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        micText.textContent = 'Listening... Speak Now';
        recordingIndicator.classList.remove('hidden');
      } else {
        recognition.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
        micText.textContent = 'Click Mic to Speak';
        recordingIndicator.classList.add('hidden');
      }
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      utteranceInput.value = transcript;
      isRecording = false;
      micBtn.classList.remove('recording');
      micText.textContent = 'Click Mic to Speak';
      recordingIndicator.classList.add('hidden');
      submitUtterance(transcript);
    };

    recognition.onerror = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
      micText.textContent = 'Click Mic to Speak';
      recordingIndicator.classList.add('hidden');
    };
  } else {
    micBtn.addEventListener('click', () => {
      alert('Browser speech recognition not natively available. Use the text box or quick samples to test endpoints!');
    });
  }
});
