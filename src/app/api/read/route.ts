// Next.js API route: POST /api/read
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// Gemma 4 on the Gemini API
const MODEL_ID = "gemma-4-26b-a4b-it";

const LANGUAGES = ["English", "French"] as const;
type Language = (typeof LANGUAGES)[number];

const FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
type FileType = (typeof FILE_TYPES)[number];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function isFileType(value: unknown): value is FileType {
  return FILE_TYPES.includes(value as FileType);
}

function normalizeMime(value: unknown): FileType | null {
  if (value === "image/jpg") return "image/jpeg";
  if (isFileType(value)) return value;
  return null;
}

function publicError(err: unknown) {
  const raw = err instanceof Error ? err.message : "Model request failed";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? raw;
  } catch {
    return raw;
  }
}

// Standing rules for the model. Marker lines stay in English.
function systemInstruction(language: Language) {
  return `You read hostel letters and short agreements.

Rules:
- Reply only in ${language}.
- Do not translate the marker lines. They must appear in English, exactly, in this order.
- Read only the message. If a photo or PDF is attached, that file is the letter. Read only the words you can see. Do not guess blurry or missing text.
- If a reader fact is provided, it was not on the page. Never treat it as something the letter said.
- Leave proper names, places, and amounts exactly as written.
- Do not invent sums, dates, motives, or legal results.
- Do not say who is right. Do not give legal advice.

Output exactly this shape, with nothing before the first marker:

WHAT_IT_ASKS:
(what the page actually asks the reader to do)

WHAT_IT_NEVER_SAYS:
(important things the page does not say)

WHAT_IT_ASSUMES:
(what the page takes as true without stating it)

WHAT_TO_ASK:
(questions a reader may need to ask — not legal advice)

YOUR_TURN:
(one short next step for the reader — if rent, dates, travel, or a refund is missing from the page, invite them to reply with that fact. Not legal advice)`;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY" },
      { status: 500 },
    );
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { letter, language, extraFact, file } = (body ?? {}) as {
    letter?: unknown;
    language?: unknown;
    extraFact?: unknown;
    file?: { mimeType?: unknown; data?: unknown };
  };

  const pasted =
    typeof letter === "string" && letter.trim().length > 0
      ? letter.trim()
      : null;

  // Chat sends { mimeType, data } where data is raw base64
  const mime = file ? normalizeMime(file.mimeType) : null;
  const upload =
    mime && typeof file?.data === "string"
      ? { mimeType: mime, data: file.data.replace(/\s/g, "") }
      : null;

  if (file && !upload) {
    return NextResponse.json(
      { error: "file must be a PDF or image (JPEG, PNG, WEBP, HEIC)" },
      { status: 400 },
    );
  }
  if (upload) {
    const bytes = Buffer.from(upload.data, "base64").length;
    if (!upload.data || bytes === 0) {
      return NextResponse.json({ error: "file is empty" }, { status: 400 });
    }
    if (bytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "file must be 10 MB or smaller" },
        { status: 400 },
      );
    }
  }
  if (!pasted && !upload) {
    return NextResponse.json(
      { error: "letter or file is required" },
      { status: 400 },
    );
  }
  if (!isLanguage(language)) {
    return NextResponse.json(
      { error: "language must be English or French" },
      { status: 400 },
    );
  }

  // Optional fact that was not on the page
  const fact =
    typeof extraFact === "string" && extraFact.trim().length > 0
      ? extraFact.trim()
      : null;

  const prompt = `Language: ${language}

${
  upload
    ? "The attached file is the letter. Read the words on that page."
    : `The message:\n${pasted}`
}

${
  fact
    ? `A fact the reader says was not on the page:\n${fact}\nKeep this marked as the reader's fact, not the letter's.`
    : "The reader did not add a fact from outside the page."
}`;

  // Same JSON the Gemini REST API expects: text and/or inlineData parts
  const contents = upload
    ? [
        { inlineData: { mimeType: upload.mimeType, data: upload.data } },
        { text: prompt },
      ]
    : [{ text: prompt }];

  const generateRequest = {
    model: MODEL_ID,
    contents,
    config: {
      // Gemma 4 returns HTTP 500 errors if systemInstruction is set as a plain string instead of an object with a 'parts' array.
      systemInstruction: {
        parts: [{ text: systemInstruction(language) }],
      },
    },
  };

  // Equivalent HTTP (no @google/genai — same call from Go, curl, etc.):
  //
  // POST https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent
  // x-goog-api-key: $GEMINI_API_KEY
  // Content-Type: application/json
  //
  // {
  //   "systemInstruction": {
  //     "parts": [{ "text": "<system rules>" }]
  //   },
  //   "contents": [{
  //     "parts": [
  //       { "inlineData": { "mimeType": "image/jpeg", "data": "<base64>" } },
  //       { "text": "<prompt>" }
  //     ]
  //   }]
  // }
  //
  // Paste-only: drop the inlineData part. Auth can also be ?key= instead of the header.

  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    try {
      response = await ai.models.generateContent(generateRequest);
    } catch (err) {
      const first = err instanceof Error ? err.message : "";
      if (!first.includes("INTERNAL") && !first.includes("500")) throw err;
      response = await ai.models.generateContent(generateRequest);
    }
  } catch (err) {
    return NextResponse.json({ error: publicError(err) }, { status: 502 });
  }

  const text = response.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "Empty model reply" }, { status: 502 });
  }

  return NextResponse.json({ text });
}
