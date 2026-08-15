# 🎙️ Voice-Enabled Transaction Agent API (`outcome`)

This repository contains the complete **Voice-Enabled Transaction Agent API** backend service built for the **LigthsON** Personal Finance Application, fully complying with the **Vendor API Technical Requirements Specification**.

It enables users to speak natural language financial transactions (e.g. *"Spent 500 rupees on groceries today"*, *"Add 20,000 salary credited"*, *"Invested 5000 in Mutual Fund SIP"*) and converts them into structured JSON data or directly updates **Firebase Firestore** collections (`users/{userId}/income`, `expenses`, `investments`).

---

## 🌟 Key Capabilities & Compliance

* **Integration Model Support:**
  * **Model A (Voice + NLU Only):** Converts speech/text input into structured JSON conforming to Section 3.2 schema and returns it to the client.
  * **Model B (Full Pipeline + Firestore CRUD):** Performs direct CRUD writes to Firestore with required audit tag (`source: "voice_agent"`) and server timestamps.
* **Input Formats:** Accepts natural language text strings, base64 audio streams, or multipart audio files (`.wav`, `.m4a`, `.mp3`).
* **Category Taxonomy Mapping:** Automatically maps Indian financial utterances and Hinglish terms into predefined categories:
  * **Income:** Salary, Freelance, Business, Interest, Gift, Refund, Other
  * **Expense:** Groceries, Transport, Rent, Utilities, Food & Dining, Entertainment, Healthcare, Shopping, Other
  * **Investment:** Mutual Fund SIP, Stocks, Fixed Deposit, Gold, PPF/EPF, Crypto, Other
* **Conversational Fallback & Follow-ups:** Maintains short session state (`sessionId`) and asks clarifying questions when mandatory fields (`amount`, `category`) are missing or low-confidence.
* **Interactive Web Sandbox:** Features a built-in browser UI at `http://localhost:3000` to visually test microphone recording, text parsing, and API responses.

* **Interactive LiveKit Voice Assistant:** Real-time WebRTC audio connection allowing hands-free voice conversations with animated audio visualizer and speech feedback.
* **Conversational CRUD Operations:** Full database manipulation directly through speech dialog:
  * **Create:** *"Spent 500 on groceries"* -> Logs expense to Firestore & ingests into RAG memory.
  * **Read / Query:** *"What are my total expenses?"* -> Computes summaries & financial breakdown.
  * **Update:** *"Update my grocery expense to 700"* -> Modifies existing record in ledger.
  * **Delete:** *"Delete my last expense"* -> Removes record from Firestore with voice confirmation.
* **RAG Financial Intelligence:** Semantic vector embeddings of user transactions providing instant multi-turn memory and holistic financial health analysis.
* **Live Firestore Transactions Ledger:** Real-time visual dashboard synchronized with every voice turn.


---

## 🚀 Quick Start (Local Hosting)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start API Server
```bash
npm start
```
The server will start at `http://localhost:3000`.

### 3. Open Interactive Web Sandbox
Navigate to `http://localhost:3000` in your web browser to test the interactive voice microphone and text testing interface.

### 4. Run Test Suite
```bash
npm test
```

---

## 🌐 Hosting & Deployment Options

You can host this backend service on any cloud platform:

### Option A: Deploy to Render (Recommended)
1. Push this `outcome` folder to GitHub.
2. Log in to [Render](https://render.com) and click **New Web Service**.
3. Select your repository. Render will automatically detect `render.yaml`.
4. Click **Deploy**. Render will generate your hosted URL (e.g., `https://ligthson-voice-agent.onrender.com`).

### Option B: Deploy to Vercel
Run via Vercel CLI:
```bash
npx vercel --prod
```

### Option C: Deploy with Docker
```bash
docker build -t ligthson-voice-api .
docker run -p 3000:3000 ligthson-voice-api
```

---

## 🔌 Connecting Hosted API to Frontend

Once hosted (e.g., `https://your-hosted-domain.onrender.com`), pass the hosted URL to your frontend or mobile app configuration:

```javascript
const VOICE_AGENT_API_URL = "https://your-hosted-domain.onrender.com/api/voice/process-text";

async function sendVoiceTransaction(textUtterance) {
  const response = await fetch(VOICE_AGENT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: textUtterance,
      model: "A" // or "B" for direct Firestore write
    })
  });
  return await response.json();
}
```

For comprehensive endpoint specifications and payload examples, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).
