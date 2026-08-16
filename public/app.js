document.addEventListener('DOMContentLoaded', () => {
  // Authentication Security Gate Elements
  const authOverlay = document.getElementById('auth-gate-overlay');
  const mainAppContainer = document.getElementById('main-app-container');
  const authForm = document.getElementById('auth-form');
  const authUsername = document.getElementById('auth-username');
  const authPassword = document.getElementById('auth-password');
  const authError = document.getElementById('auth-error');
  const logoutBtn = document.getElementById('logout-btn');

  // DOM Elements
  const talkBtn = document.getElementById('talk-assistant-btn');
  const talkBtnText = document.getElementById('talk-btn-text');
  const muteBtn = document.getElementById('mute-mic-btn');
  const muteIcon = document.getElementById('mute-icon');
  const muteText = document.getElementById('mute-text');
  const endCallBtn = document.getElementById('end-call-btn');
  const ttsAudioToggle = document.getElementById('tts-audio-toggle');
  
  const voiceBadge = document.getElementById('voice-status-badge');
  const voiceDot = document.getElementById('voice-dot');
  const voiceStatusText = document.getElementById('voice-status-text');
  const voiceInfoStrip = document.getElementById('voice-info-strip');
  const streamServerVal = document.getElementById('stream-server-val');
  const streamRoomVal = document.getElementById('stream-room-val');
  const streamParticipantVal = document.getElementById('stream-participant-val');
  
  const agentAvatar = document.getElementById('agent-avatar');
  const avatarEmoji = document.getElementById('avatar-emoji');
  const waveVisualizer = document.getElementById('wave-visualizer');
  const assistantStateText = document.getElementById('assistant-state-text');
  const dialogFeed = document.getElementById('dialog-feed');
  const dialogCountBadge = document.getElementById('dialog-count-badge');
  const clearFeedBtn = document.getElementById('clear-feed-btn');
  
  const textForm = document.getElementById('text-form');
  const utteranceInput = document.getElementById('utterance-input');
  const voiceChips = document.querySelectorAll('.voice-chip');
  
  const totalExpensesStat = document.getElementById('total-expenses-stat');
  const totalIncomeStat = document.getElementById('total-income-stat');
  const totalInvestmentsStat = document.getElementById('total-investments-stat');
  const transactionsList = document.getElementById('transactions-list');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const countAll = document.getElementById('count-all');
  const countExp = document.getElementById('count-exp');
  const countInc = document.getElementById('count-inc');
  const countInv = document.getElementById('count-inv');
  
  const refreshLedgerBtn = document.getElementById('refresh-ledger-btn');
  const manualAddBtn = document.getElementById('manual-add-btn');
  const triggerRagSummaryBtn = document.getElementById('trigger-rag-summary-btn');
  const ragContextBox = document.getElementById('rag-context-box');
  const jsonOutput = document.getElementById('json-output');
  const confidenceBadge = document.getElementById('confidence-badge');
  
  const clarificationBanner = document.getElementById('clarification-banner');
  const clarificationMsg = document.getElementById('clarification-msg');
  
  // Modal Elements
  const modal = document.getElementById('transaction-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalForm = document.getElementById('modal-form');
  const modalDocId = document.getElementById('modal-doc-id');
  const modalType = document.getElementById('modal-type');
  const modalCategory = document.getElementById('modal-category');
  const modalAmount = document.getElementById('modal-amount');
  const modalDate = document.getElementById('modal-date');
  const modalNotes = document.getElementById('modal-notes');

  // Application State
  let voiceRoom = null;
  let localAudioTrack = null;
  let isCallActive = false;
  let isMuted = false;
  let speechRecognizer = null;
  let isRecognizing = false;
  let allTransactions = [];
  let currentFilter = 'all';
  let turnCount = 0;
  let audioContext = null;
  let analyserNode = null;
  let visualizerAnimFrame = null;
  const currentUserId = 'user_' + Math.random().toString(36).substr(2, 6);

  // Voice Language Mode (cycling through all supported modes)
  const LANG_MODES = [
    { id: 'en-IN',   label: 'English (India)',       ttsLang: 'en-IN' },
    { id: 'ta-IN',   label: 'Tamil',                  ttsLang: 'ta-IN' },
    { id: 'hi-IN',   label: 'Hindi',                  ttsLang: 'hi-IN' },
    { id: 'en-ta',   label: 'English + Tamil',         ttsLang: 'en-IN' },
    { id: 'hi-en',   label: 'Hindi + English',         ttsLang: 'hi-IN' },
  ];
  let currentLangIdx = 0;

  // Proactive conversation context (remembers partial category)
  let proactiveContext = null; // { category, type }

  // Preferred male TTS voice (set once voices load)
  let preferredTTSVoice = null;
  function loadPreferredVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    // Priority: Male Indian English → Male Hindi → Any Google male → first en-IN → first
    const maleMatchers = [
      v => v.name.toLowerCase().includes('rishi'),           // Chrome Indian male
      v => v.name.toLowerCase().includes('deepak'),
      v => v.name.toLowerCase().includes('hemant'),
      v => v.name.toLowerCase().includes('karthik'),
      v => v.lang === 'en-IN' && v.name.toLowerCase().includes('male'),
      v => v.name.toLowerCase().includes('google uk english male'),
      v => v.name.toLowerCase().includes('google') && v.lang.startsWith('en'),
      v => v.lang === 'en-IN',
      v => v.lang.startsWith('en'),
    ];
    for (const matcher of maleMatchers) {
      const found = voices.find(matcher);
      if (found) { preferredTTSVoice = found; break; }
    }
    if (!preferredTTSVoice) preferredTTSVoice = voices[0];
    console.log('🎙️ TTS Voice selected:', preferredTTSVoice?.name);
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadPreferredVoice;
    loadPreferredVoice();
  }

  // -------------------------------------------------------------
  // 1. SECURITY AUTHENTICATION GATE (Username: admin, Password: GODADDYLIVE)
  // -------------------------------------------------------------
  const AUTH_KEY = 'ligthson_security_session';
  checkAuth();

  function checkAuth() {
    const isAuthed = sessionStorage.getItem(AUTH_KEY) === 'authenticated_admin';
    if (isAuthed) {
      authOverlay.classList.add('hidden');
      mainAppContainer.classList.remove('hidden');
      initAppDashboard();
    } else {
      authOverlay.classList.remove('hidden');
      mainAppContainer.classList.add('hidden');
    }
  }

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = authUsername.value.trim();
    const pass = authPassword.value.trim();

    // Validate Username: admin (case-insensitive) & Password: GODADDYLIVE (or godaddylive)
    const validUser = user.toLowerCase() === 'admin';
    const validPass = pass.toLowerCase() === 'godaddylive' || pass === 'GODADDYLIVE';

    if (validUser && validPass) {
      authError.classList.add('hidden');
      sessionStorage.setItem(AUTH_KEY, 'authenticated_admin');
      authOverlay.classList.add('hidden');
      mainAppContainer.classList.remove('hidden');
      initAppDashboard();
    } else {
      authError.classList.remove('hidden');
      authError.textContent = '❌ Access Denied: Invalid Username or Password.';
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    if (isCallActive) disconnectVoiceSession();
    authUsername.value = '';
    authPassword.value = '';
    authError.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    mainAppContainer.classList.add('hidden');
  });

  // -------------------------------------------------------------
  // 2. DASHBOARD INITIALIZATION
  // -------------------------------------------------------------
  function initAppDashboard() {
    checkApiHealth();
    loadTransactions();
    initSpeechRecognition();
  }

  // API Health Check
  async function checkApiHealth() {
    try {
      const res = await fetch('/api/voice/health');
      const data = await res.json();
      const apiStatusText = document.getElementById('api-status-text');
      if (data.status === 'online') {
        apiStatusText.textContent = 'API Online (NLU + RAG)';
      }
    } catch (e) {
      console.warn('API Health Check failed:', e);
    }
  }

  // Voice Session Connection Handler
  talkBtn.addEventListener('click', async () => {
    if (!isCallActive) {
      await startVoiceSession();
    } else {
      startListeningTurn();
    }
  });

  endCallBtn.addEventListener('click', () => {
    disconnectVoiceSession();
  });

  muteBtn.addEventListener('click', () => {
    toggleMute();
  });

  async function startVoiceSession() {
    try {
      setAssistantState('connecting', 'Connecting to AI Voice Engine...');
      talkBtnText.textContent = 'Connecting...';

      // 1. Fetch WebRTC Participant Token from API
      const tokenRes = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          roomName: 'finance-voice-room'
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.success || !tokenData.participant_token) {
        throw new Error(tokenData.message || 'Failed to acquire voice stream token');
      }

      const serverUrl = tokenData.server_url;
      const participantToken = tokenData.participant_token;
      const roomName = tokenData.room_name;

      // 2. Connect to Voice Room via Client SDK
      if (window.LivekitClient) {
        try {
          voiceRoom = new window.LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });

          voiceRoom.on(window.LivekitClient.RoomEvent.Connected, () => {
            console.log('✅ Connected to Voice Room:', roomName);
          });

          voiceRoom.on(window.LivekitClient.RoomEvent.Disconnected, () => {
            console.log('🔌 Disconnected from Voice Room');
            handleVoiceDisconnected();
          });

          // Connect to room
          await voiceRoom.connect(serverUrl, participantToken);

          // Acquire and publish local microphone audio track
          localAudioTrack = await window.LivekitClient.createLocalAudioTrack();
          await voiceRoom.localParticipant.publishTrack(localAudioTrack);
          console.log('🎤 Microphone audio track published to Voice Stream');

          hookAudioVisualizer(localAudioTrack.mediaStream);
        } catch (transportErr) {
          console.warn('⚠️ WebRTC transport fallback:', transportErr.message);
          await acquireLocalMicrophoneStream();
        }
      } else {
        await acquireLocalMicrophoneStream();
      }

      // Update UI to Active Call
      isCallActive = true;
      talkBtn.classList.add('active-call');
      talkBtnText.textContent = '🎙️ Listening to You...';
      muteBtn.classList.remove('hidden');
      endCallBtn.classList.remove('hidden');

      // Update Badge & Info Strip
      voiceBadge.classList.add('connected');
      voiceDot.classList.remove('dot-amber');
      voiceDot.classList.add('dot');
      voiceStatusText.textContent = 'Voice Engine 🟢 Connected';

      voiceInfoStrip.classList.remove('hidden');
      streamServerVal.textContent = serverUrl.replace('ws://', '').replace('wss://', '');
      streamRoomVal.textContent = roomName;
      streamParticipantVal.textContent = currentUserId;

      setAssistantState('listening', 'Voice Engine connected! Speak any transaction now — e.g. "Spent 500 on groceries" or "What are my expenses?"');

      // Proactive greeting — immediately speak and then listen, no gap
      speakAssistantResponse(
        "Hey! I'm your finance assistant. What did you spend money on today? Just say something like — groceries, food, auto, or petrol.",
        () => { startListeningTurn(); }
      );
      // Do NOT call startListeningTurn here — it's called in the callback above

    } catch (error) {
      console.error('Failed to start voice session:', error);
      isCallActive = true;
      talkBtn.classList.add('active-call');
      talkBtnText.textContent = '🎙️ Listening (Voice Mode)...';
      muteBtn.classList.remove('hidden');
      endCallBtn.classList.remove('hidden');
      startListeningTurn();
    }
  }

  async function acquireLocalMicrophoneStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      hookAudioVisualizer(stream);
    } catch (e) {
      console.warn('Microphone stream error:', e);
    }
  }

  function hookAudioVisualizer(stream) {
    try {
      if (!stream) return;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64;
      source.connect(analyserNode);

      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const bars = document.querySelectorAll('.wave-bar');

      function renderWave() {
        if (!isCallActive) return;
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
          if (bars[i % bars.length]) {
            const h = Math.max(6, Math.min(36, (dataArray[i] / 255) * 40));
            bars[i % bars.length].style.height = `${h}px`;
          }
        }
        if (sum / bufferLength > 15) {
          agentAvatar.classList.add('listening');
        } else {
          agentAvatar.classList.remove('listening');
        }
        visualizerAnimFrame = requestAnimationFrame(renderWave);
      }
      renderWave();
    } catch (e) {
      console.warn('Audio visualizer init error:', e);
    }
  }

  function disconnectVoiceSession() {
    if (voiceRoom) {
      try { voiceRoom.disconnect(); } catch (e) {}
      voiceRoom = null;
    }
    if (localAudioTrack) {
      try { localAudioTrack.stop(); } catch (e) {}
      localAudioTrack = null;
    }
    if (speechRecognizer && isRecognizing) {
      try { speechRecognizer.stop(); } catch (e) {}
    }
    if (visualizerAnimFrame) {
      cancelAnimationFrame(visualizerAnimFrame);
    }
    handleVoiceDisconnected();
  }

  function handleVoiceDisconnected() {
    isCallActive = false;
    talkBtn.classList.remove('active-call');
    talkBtnText.textContent = 'Talk to Your Voice Assistant';
    muteBtn.classList.add('hidden');
    endCallBtn.classList.add('hidden');

    voiceBadge.classList.remove('connected');
    voiceDot.classList.remove('dot');
    voiceDot.classList.add('dot-amber');
    voiceStatusText.textContent = 'Voice Engine Idle';
    voiceInfoStrip.classList.add('hidden');

    setAssistantState('idle', 'Click "Talk to Your Voice Assistant" to start talking.');
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (localAudioTrack) {
      if (isMuted) {
        localAudioTrack.mute();
      } else {
        localAudioTrack.unmute();
      }
    }
    if (isMuted) {
      muteText.textContent = 'Unmute Mic';
      muteIcon.textContent = '🔇';
      muteBtn.classList.add('btn-danger');
      setAssistantState('muted', 'Microphone muted.');
    } else {
      muteText.textContent = 'Mute Mic';
      muteIcon.textContent = '🎤';
      muteBtn.classList.remove('btn-danger');
      setAssistantState('listening', 'Microphone active. Listening to your voice...');
      startListeningTurn();
    }
  }

  function setAssistantState(state, message) {
    assistantStateText.textContent = message;
    waveVisualizer.classList.remove('active');
    agentAvatar.classList.remove('speaking', 'listening');

    if (state === 'listening') {
      avatarEmoji.textContent = '👂';
      waveVisualizer.classList.add('active');
      agentAvatar.classList.add('listening');
    } else if (state === 'thinking') {
      avatarEmoji.textContent = '🧠';
      waveVisualizer.classList.add('active');
    } else if (state === 'speaking') {
      avatarEmoji.textContent = '🗣️';
      waveVisualizer.classList.add('active');
      agentAvatar.classList.add('speaking');
    } else if (state === 'connecting') {
      avatarEmoji.textContent = '📡';
    } else {
      avatarEmoji.textContent = '🤖';
    }
  }

  // --- Language Mode Selector UI (injected dynamically) ---
  function buildLangSwitcher() {
    const bar = document.querySelector('.voice-action-bar');
    if (!bar || document.getElementById('lang-mode-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lang-mode-btn';
    btn.className = 'btn btn-xs btn-outline';
    btn.title = 'Switch voice language';
    btn.style.cssText = 'margin-left:8px; font-size:12px; padding:4px 10px;';
    btn.textContent = '🌐 ' + LANG_MODES[currentLangIdx].label;
    btn.addEventListener('click', () => {
      currentLangIdx = (currentLangIdx + 1) % LANG_MODES.length;
      const mode = LANG_MODES[currentLangIdx];
      btn.textContent = '🌐 ' + mode.label;
      if (speechRecognizer) speechRecognizer.lang = mode.id === 'en-ta' ? 'ta-IN' : (mode.id === 'hi-en' ? 'hi-IN' : mode.id);
      speakAssistantResponse('Language switched to ' + mode.label, null);
    });
    bar.appendChild(btn);
  }

  // Web Speech Recognition — Multi-Language
  function initSpeechRecognition() {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognizer = new SpeechRec();
      speechRecognizer.continuous = false;
      speechRecognizer.interimResults = false;
      speechRecognizer.lang = 'en-IN'; // default; changes when user switches language

      speechRecognizer.onstart = () => {
        isRecognizing = true;
        setAssistantState('listening', 'Listening... speak now.');
      };

      speechRecognizer.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('🗣️ User Voice Transcript:', transcript);
        utteranceInput.value = transcript;
        processConversationalTurn(transcript);
      };

      speechRecognizer.onerror = (err) => {
        console.warn('Speech recognition warning:', err.error);
        isRecognizing = false;
        if (isCallActive && !isMuted) {
          setTimeout(startListeningTurn, 600);
        }
      };

      speechRecognizer.onend = () => {
        isRecognizing = false;
        if (isCallActive && !isMuted && !window.speechSynthesis.speaking) {
          setTimeout(startListeningTurn, 400); // minimal gap between turns
        }
      };

      buildLangSwitcher();
    }
  }

  function startListeningTurn() {
    if (!speechRecognizer || isMuted) return;
    if (!isRecognizing) {
      try {
        speechRecognizer.start();
      } catch (e) {
        // already active
      }
    }
  }

  // Form Submit Handler
  textForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = utteranceInput.value.trim();
    if (text) {
      processConversationalTurn(text);
      utteranceInput.value = '';
    }
  });

  // Voice Prompt Chips
  voiceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleText = chip.dataset.text;
      utteranceInput.value = sampleText;
      processConversationalTurn(sampleText);
    });
  });

  // Clear Feed
  clearFeedBtn.addEventListener('click', () => {
    dialogFeed.innerHTML = '';
    turnCount = 0;
    dialogCountBadge.textContent = '0 Turns';
  });

  // --- Proactive Category Detection (before API call) ---
  const CATEGORY_TRIGGERS = [
    { words: ['grocery','groceries','sabzi','kirana','maligai','kaaikari','blinkit','zepto','d-mart','dmart','vegetables','veggies'], cat: 'Groceries', type: 'expense' },
    { words: ['food','lunch','dinner','breakfast','zomato','swiggy','restaurant','hotel','biryani','pizza','khana','saapadu','tiffin'], cat: 'Food & Dining', type: 'expense' },
    { words: ['auto','cab','uber','ola','rapido','metro','bus','petrol','diesel','fuel','train','ticket','vandi'], cat: 'Transport', type: 'expense' },
    { words: ['electricity','current bill','eb bill','power bill','water bill','wifi','internet','gas','cylinder'], cat: 'Utilities', type: 'expense' },
    { words: ['rent','vaadagai','kiraya','house rent'], cat: 'Rent', type: 'expense' },
    { words: ['movie','cinema','netflix','prime','hotstar','ott','padam','show'], cat: 'Entertainment', type: 'expense' },
    { words: ['doctor','hospital','medicine','marunthu','pharmacy','dawa'], cat: 'Healthcare', type: 'expense' },
    { words: ['shopping','amazon','flipkart','myntra','clothes','thuni','mall'], cat: 'Shopping', type: 'expense' },
    { words: ['salary','sambalam','tankhwah'], cat: 'Salary', type: 'income' },
    { words: ['sip','mutual fund','mf','fd','fixed deposit','gold','stocks','shares','invest'], cat: 'Mutual Fund SIP', type: 'investment' },
  ];

  function detectCategoryFromText(text) {
    const lower = text.toLowerCase();
    for (const trigger of CATEGORY_TRIGGERS) {
      if (trigger.words.some(w => lower.includes(w))) {
        return { category: trigger.cat, type: trigger.type };
      }
    }
    return null;
  }

  function detectAmountFromText(text) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:k|thousand|hazar|lakh|latcham|ayiram)?/i);
    return m ? parseFloat(m[1].replace(',', '')) : null;
  }

  // Conversational Turn Processor (NLU + RAG + Firestore CRUD)
  async function processConversationalTurn(userText) {
    if (!userText || userText.trim() === '') return;

    appendDialogMessage('user', userText);
    setAssistantState('thinking', '⚡ Processing your request...');

    // -- PROACTIVE FLOW: If user only said a category word with no amount --
    const detected = detectCategoryFromText(userText);
    const detectedAmt = detectAmountFromText(userText);

    if (detected && !detectedAmt && !proactiveContext) {
      // User said "groceries" or "sabzi" with no amount — ask proactively!
      proactiveContext = detected;
      const followUp = `How much did you spend for ${detected.category}?`;
      appendDialogMessage('agent', followUp, null);
      clarificationBanner.classList.remove('hidden');
      clarificationMsg.textContent = followUp;
      setAssistantState('speaking', followUp);
      speakAssistantResponse(followUp, () => {
        if (isCallActive && !isMuted) {
          setAssistantState('listening', `Waiting for amount for ${detected.category}...`);
          startListeningTurn();
        }
      });
      return;
    }

    // -- If proactiveContext is set and now user gave amount, merge --
    let finalText = userText;
    if (proactiveContext && detectedAmt) {
      finalText = `Spent ${userText} on ${proactiveContext.category}`;
      proactiveContext = null;
      clarificationBanner.classList.add('hidden');
    } else if (proactiveContext && !detectedAmt) {
      // Still no amount, keep asking
      const followUp = `I didn't catch the amount. How much did you spend for ${proactiveContext.category}?`;
      appendDialogMessage('agent', followUp, null);
      speakAssistantResponse(followUp, () => startListeningTurn());
      return;
    } else {
      proactiveContext = null;
      clarificationBanner.classList.add('hidden');
    }

    try {
      const response = await fetch('/api/voice/agent/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: finalText,
          userId: currentUserId
        })
      });

      const data = await response.json();
      console.log('🤖 Conversational Agent Output:', data);

      jsonOutput.textContent = JSON.stringify(data, null, 2);
      if (data.parsedData?.confidence) {
        confidenceBadge.textContent = `Confidence: ${Math.round(data.parsedData.confidence * 100)}%`;
      }

      if (data.requires_clarification) {
        clarificationBanner.classList.remove('hidden');
        clarificationMsg.textContent = data.follow_up_question;
      } else {
        clarificationBanner.classList.add('hidden');
      }

      // Proactively handle clarification_needed from backend too
      if (data.action_performed === 'clarification_needed' && data.parsedData) {
        const cat = data.parsedData.category;
        if (cat && cat !== 'Other') {
          proactiveContext = { category: cat, type: data.parsedData.transaction_type || 'expense' };
        }
      }

      const reply = data.spokenResponse || data.confirmation_spoken || 'Transaction processed successfully.';
      appendDialogMessage('agent', reply, data.action_performed);

      if (data.transactions) {
        allTransactions = data.transactions;
        renderLedger(allTransactions);
        updateStats(allTransactions);
      } else {
        await loadTransactions();
      }

      if (data.ragResult?.summary) {
        ragContextBox.innerHTML = `<strong>🧠 RAG Financial Summary:</strong><p>${data.ragResult.summary}</p>`;
      } else if (data.action_performed === 'create' && data.parsedData) {
        ragContextBox.innerHTML = `<strong>🧠 Vector Memory Ingested:</strong><p>Embedded: ${data.parsedData.transaction_type} of ₹${data.parsedData.amount} for ${data.parsedData.category} (${data.parsedData.date}).</p>`;
      }

      setAssistantState('speaking', reply);
      speakAssistantResponse(reply, () => {
        if (isCallActive && !isMuted) {
          setAssistantState('listening', 'Listening for your next command...');
          startListeningTurn();
        } else {
          setAssistantState('idle', 'Ready for next voice or text input.');
        }
      });

    } catch (error) {
      console.error('Conversation turn error:', error);
      const errMsg = 'Error connecting to agent: ' + error.message;
      appendDialogMessage('agent', errMsg);
      setAssistantState('idle', errMsg);
    }
  }

  // Append Message to Conversation Feed
  function appendDialogMessage(sender, text, actionTag = null) {
    turnCount++;
    dialogCountBadge.textContent = `${turnCount} Turns`;

    const msgEl = document.createElement('div');
    msgEl.className = `dialog-msg ${sender}-msg`;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const avatar = sender === 'user' ? '👤' : '🤖';
    const senderName = sender === 'user' ? 'You' : 'LigthsON Agent';

    let tagHtml = '';
    if (actionTag) {
      tagHtml = `<span class="msg-crud-tag tag-${actionTag}">CRUD: ${actionTag.toUpperCase()}</span>`;
    }

    msgEl.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-content">
        <div class="msg-header">
          <strong>${senderName}</strong>
          <span class="msg-time">${now}</span>
        </div>
        <p>${escapeHtml(text)}</p>
        ${tagHtml}
      </div>
    `;

    dialogFeed.appendChild(msgEl);
    dialogFeed.scrollTop = dialogFeed.scrollHeight;
  }

  // Text-To-Speech Synthesis — Male Voice, Multi-Lang, High Speed
  function speakAssistantResponse(text, onEndCallback) {
    if (!ttsAudioToggle || !ttsAudioToggle.checked) {
      if (onEndCallback) onEndCallback();
      return;
    }
    if (!('speechSynthesis' in window)) {
      if (onEndCallback) onEndCallback();
      return;
    }

    // Cancel any ongoing speech immediately
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Speed: 1.35 is fast & clear, feels natural and professional
    utterance.rate  = 1.35;
    utterance.pitch = 0.88;  // Slightly lower pitch = more masculine, deeper voice
    utterance.volume = 1.0;

    // Set TTS language based on selected mode
    const mode = LANG_MODES[currentLangIdx];
    utterance.lang = mode.ttsLang;

    // Assign best available voice
    if (preferredTTSVoice) {
      utterance.voice = preferredTTSVoice;
    } else {
      // Lazy-load voices and retry
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        loadPreferredVoice();
        if (preferredTTSVoice) utterance.voice = preferredTTSVoice;
      }
    }

    utterance.onend = () => { if (onEndCallback) onEndCallback(); };
    utterance.onerror = (e) => {
      console.warn('TTS error:', e.error);
      if (onEndCallback) onEndCallback();
    };

    window.speechSynthesis.speak(utterance);

    // Workaround: Chrome sometimes pauses long utterances — keep it alive
    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10000);
    utterance.onend = () => { clearInterval(keepAlive); if (onEndCallback) onEndCallback(); };
    utterance.onerror = (e) => { clearInterval(keepAlive); console.warn('TTS error:', e.error); if (onEndCallback) onEndCallback(); };
  }

  // Load Transactions from Backend
  async function loadTransactions() {
    try {
      const res = await fetch(`/api/voice/transactions?userId=${currentUserId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.transactions)) {
        allTransactions = data.transactions;
        renderLedger(allTransactions);
        updateStats(allTransactions);
      }
    } catch (e) {
      console.warn('Failed to load transactions:', e);
    }
  }

  // Render Ledger Cards
  function renderLedger(transactions) {
    let filtered = transactions;
    if (currentFilter !== 'all') {
      filtered = transactions.filter(t => t.transaction_type === currentFilter);
    }

    countAll.textContent = transactions.length;
    countExp.textContent = transactions.filter(t => t.transaction_type === 'expense').length;
    countInc.textContent = transactions.filter(t => t.transaction_type === 'income').length;
    countInv.textContent = transactions.filter(t => t.transaction_type === 'investment').length;

    if (filtered.length === 0) {
      transactionsList.innerHTML = `<div class="empty-state" style="padding: 24px; text-align: center; color: var(--text-dim);">No transactions found in this view. Speak a transaction to add one!</div>`;
      return;
    }

    transactionsList.innerHTML = '';
    filtered.forEach((tx) => {
      const card = document.createElement('div');
      card.className = 'tx-card';
      card.id = `tx-${tx.id}`;

      const iconMap = {
        expense: '🛒',
        income: '💰',
        investment: '📈'
      };
      const icon = iconMap[tx.transaction_type] || '💳';
      const amountPrefix = tx.transaction_type === 'income' ? '+' : (tx.transaction_type === 'investment' ? '▲' : '-');

      card.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon icon-${tx.transaction_type}">${icon}</div>
          <div class="tx-info">
            <span class="tx-category">${escapeHtml(tx.category || 'General')}</span>
            <div class="tx-meta">
              <span>📅 ${tx.date || 'Today'}</span>
              <span>•</span>
              <span>🏷️ ${tx.transaction_type.toUpperCase()}</span>
              ${tx.notes ? `<span>• 📝 ${escapeHtml(tx.notes)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount amount-${tx.transaction_type}">${amountPrefix}₹${Number(tx.amount || 0).toLocaleString('en-IN')}</span>
          <div class="tx-actions">
            <button class="tx-btn edit-btn" title="Edit" data-id="${tx.id}" data-type="${tx.transaction_type}">✏️</button>
            <button class="tx-btn delete-btn" title="Delete" data-id="${tx.id}" data-type="${tx.transaction_type}">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(tx));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteTransaction(tx.transaction_type, tx.id));

      transactionsList.appendChild(card);
    });
  }

  // Update Summary Counters
  function updateStats(transactions) {
    const expenses = transactions.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const income = transactions.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const investments = transactions.filter(t => t.transaction_type === 'investment').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    totalExpensesStat.textContent = `₹${expenses.toLocaleString('en-IN')}`;
    totalIncomeStat.textContent = `₹${income.toLocaleString('en-IN')}`;
    totalInvestmentsStat.textContent = `₹${investments.toLocaleString('en-IN')}`;
  }

  // Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderLedger(allTransactions);
    });
  });

  // Refresh Ledger
  refreshLedgerBtn.addEventListener('click', () => {
    loadTransactions();
  });

  // Trigger RAG Full Summary
  triggerRagSummaryBtn.addEventListener('click', async () => {
    ragContextBox.innerHTML = `<span style="color: var(--primary-glow);">Generating comprehensive RAG financial report...</span>`;
    try {
      const res = await fetch('/api/voice/rag/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });
      const data = await res.json();
      if (data.summary) {
        ragContextBox.innerHTML = `<strong>📊 Comprehensive Financial Health Report:</strong><p>${data.summary}</p>`;
        speakAssistantResponse("Here is your full financial summary: " + data.summary.slice(0, 200));
      }
    } catch (e) {
      ragContextBox.innerHTML = `<span style="color: #f87171;">Failed to generate summary: ${e.message}</span>`;
    }
  });

  // Delete Transaction
  async function deleteTransaction(type, id) {
    if (!confirm('Are you sure you want to delete this transaction from Firestore?')) return;
    try {
      const res = await fetch(`/api/voice/transactions/${type}/${id}?userId=${currentUserId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await loadTransactions();
        appendDialogMessage('agent', `Deleted ${type} transaction (${id}) from database.`, 'delete');
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  }

  // Modal Handlers
  manualAddBtn.addEventListener('click', () => {
    modalTitle.textContent = 'Add Transaction';
    modalDocId.value = '';
    modalType.value = 'expense';
    modalCategory.value = '';
    modalAmount.value = '';
    modalDate.value = new Date().toISOString().split('T')[0];
    modalNotes.value = '';
    modal.classList.remove('hidden');
  });

  function openEditModal(tx) {
    modalTitle.textContent = 'Edit Transaction';
    modalDocId.value = tx.id;
    modalType.value = tx.transaction_type;
    modalCategory.value = tx.category || '';
    modalAmount.value = tx.amount || '';
    modalDate.value = tx.date || new Date().toISOString().split('T')[0];
    modalNotes.value = tx.notes || '';
    modal.classList.remove('hidden');
  }

  modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modalCancelBtn.addEventListener('click', () => modal.classList.add('hidden'));

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docId = modalDocId.value;
    const type = modalType.value;
    const payload = {
      transaction_type: type,
      category: modalCategory.value,
      amount: parseFloat(modalAmount.value),
      date: modalDate.value,
      notes: modalNotes.value,
      userId: currentUserId
    };

    try {
      if (docId) {
        await fetch(`/api/voice/transactions/${type}/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        appendDialogMessage('agent', `Updated ${type} (${payload.category}) to ₹${payload.amount}.`, 'update');
      } else {
        await fetch(`/api/voice/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        appendDialogMessage('agent', `Created new ${type} for ${payload.category} of ₹${payload.amount}.`, 'create');
      }
      modal.classList.add('hidden');
      await loadTransactions();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
