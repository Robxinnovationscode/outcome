# 🚀 Guide: Deploy Outcome API to Vercel & Connect GoDaddy Domain

This step-by-step guide will walk you through hosting the `outcome` Voice Agent API on **Vercel** and mapping your custom domain from **GoDaddy** (e.g. `api.yourdomain.com` or `yourdomain.com`).

---

## Part 1: Deploying to Vercel

### Option A: Using Vercel CLI (Fastest)

1. Open PowerShell / Terminal in the `outcome` directory:
   ```bash
   cd c:\Users\Jayvikram\Downloads\ligths-main-main\outcome
   ```

2. Run Vercel CLI:
   ```bash
   npx vercel
   ```

3. Follow the prompts:
   - **Set up and deploy?** `Y`
   - **Which scope?** (Select your Vercel account)
   - **Link to existing project?** `N`
   - **Project Name:** `ligthson-voice-api`
   - **In which directory is your code located?** `./`
   - **Want to modify build settings?** `N`

4. For production deployment, run:
   ```bash
   npx vercel --prod
   ```

### Option B: Via GitHub & Vercel Dashboard

1. Push the `outcome` folder to a new GitHub repository (e.g. `ligthson-voice-api`).
2. Log in to [Vercel Dashboard](https://vercel.com/dashboard).
3. Click **Add New...** > **Project**.
4. Import your GitHub repository.
5. Under **Environment Variables**, add any optional keys (e.g., `FIREBASE_SERVICE_ACCOUNT_KEY`, `OPENAI_API_KEY`).
6. Click **Deploy**. Vercel will give you a default URL like `https://ligthson-voice-api.vercel.app`.

---

## Part 2: Connecting your GoDaddy Domain to Vercel

### Step 1: Add Custom Domain in Vercel

1. Go to your project on Vercel: **Project Settings > Domains**.
2. Type your GoDaddy domain or subdomain:
   - For a subdomain (Recommended for APIs): `api.yourdomain.com`
   - For root domain: `yourdomain.com`
3. Click **Add**.
4. Vercel will show the exact DNS records you need to add in GoDaddy.

---

### Step 2: Configure DNS Records in GoDaddy

1. Log in to [GoDaddy Domain Portfolio](https://dnc.godaddy.com/).
2. Click on your domain name and go to **DNS Management / Edit DNS Records**.
3. Add the record shown by Vercel:

#### Case A: If using Subdomain (e.g., `api.yourdomain.com`)
- **Type:** `CNAME`
- **Name / Host:** `api`
- **Value / Points to:** `cname.vercel-dns.com`
- **TTL:** `1 Hour` (or Auto)

#### Case B: If using Root Domain (e.g., `yourdomain.com`)
- **Type:** `A`
- **Name / Host:** `@`
- **Value / Points to:** `76.76.21.21` (Vercel's IP address)
- **TTL:** `1 Hour`

4. Click **Save Records**.

---

### Step 3: Verify SSL & DNS Propagation

1. Back in Vercel **Settings > Domains**, Vercel will automatically verify the DNS records (usually takes 1–5 minutes).
2. Once verified, Vercel will generate a **free SSL Certificate (HTTPS)** automatically!
3. Test your live GoDaddy domain URL in browser or Postman:
   - `https://api.yourdomain.com/api/voice/health`
   - `https://api.yourdomain.com` (Opens the interactive Voice Sandbox UI)

---

## Part 3: Accessing the Live API from your Application

Once your GoDaddy domain is live (e.g. `https://api.yourdomain.com`), pass it to your app calls:

```javascript
const VOICE_API_ENDPOINT = "https://api.yourdomain.com/api/voice/process-text";

async function processVoiceTransaction(textUtterance) {
  const response = await fetch(VOICE_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: textUtterance,
      model: "A" // Or "B" for direct Firestore CRUD
    })
  });

  const result = await response.json();
  console.log("Voice Agent Output:", result);
  return result;
}
```
