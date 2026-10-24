# Hostel Letter

A one-page chat that reads a hostel letter or short agreement and separates what the page says from what people add in the corridor. It does not give legal advice and it does not decide who is right.

Paste the text, or attach a photo or PDF. Pick English or French. After the first read, you can send a fact that was not on the page (for example rent already paid) so it stays marked as your fact, not the letter’s.

## Setup

You need **Node.js 20+** and a Google AI Studio API key.

### 1. Install dependencies

```bash
npm install
```

### 2. Create an API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in.
2. Create an API key.
3. Copy the key. Do not commit it.

### 3. Put the key in the project

```bash
cp .env.example .env.local
```

Open `.env.local` and paste the key:

```
GEMINI_API_KEY=your_key_here
```

No quotes and no spaces around `=`. `.env` also works; Next.js loads both. `.gitignore` ignores `.env*` except `.env.example`.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). After you add or change the key, restart the dev server.

## Model

The app calls **Gemma 4** through the Gemini API with `@google/genai`.

The model id is `gemma-4-26b-a4b-it`, set as `MODEL_ID` in `src/app/api/read/route.ts`. That file is the only place the key is used (server-side `POST /api/read`).

The same HTTP call, without the npm package, is documented in a comment in that route:

`POST https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent`

## Use

1. Send a letter: paste it, click **Try the sample notice**, or attach a JPEG/PNG/PDF with **+**.
2. Read the five blocks in the reply.
3. Send a corridor fact if you need to (rent, months left, not travelling). It is re-read against the same page.
4. **New letter** starts over.
