"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLE_LETTER = `Residence Malingo, Molyko — notice from the landlady, sent through the caretaker.

Please take out every property of yours as you travel during this holiday, because during the renovation light and water will be disconnected and I will not be responsible for any missing properties and make sure to hand over the keys to the room you are to the Cite Manager Mr Foncha.`;

const SAMPLE_FACT =
  "I paid 400,000 FCFA for 12 months. Two months are left. I am not travelling.";

const LANGUAGES = ["English", "French"] as const;
type Language = (typeof LANGUAGES)[number];

const MARKERS = [
  "WHAT_IT_ASKS",
  "WHAT_IT_NEVER_SAYS",
  "WHAT_IT_ASSUMES",
  "WHAT_TO_ASK",
  "YOUR_TURN",
] as const;

type Blocks = Record<(typeof MARKERS)[number], string>;

type Source =
  | { kind: "letter"; letter: string }
  | { kind: "file"; file: { mimeType: string; data: string; name: string } };

type Message =
  | {
      id: string;
      role: "user";
      text: string;
      fileName?: string;
      imageUrl?: string;
    }
  | {
      id: string;
      role: "assistant";
      blocks?: Blocks;
      error?: string;
    };

const COPY: Record<
  Language,
  {
    title: string;
    intro: string;
    sampleNote: string;
    languageLegend: string;
    attach: string;
    send: string;
    newChat: string;
    sample: string;
    tryFact: string;
    composeLetter: string;
    composeFact: string;
    fileClear: string;
    reading: string;
    failed: string;
    labels: Record<(typeof MARKERS)[number], string>;
  }
> = {
  English: {
    title: "Hostel Letter",
    intro:
      "Send the page — paste it, or attach a photo or PDF. I will say what it asks, what it never says, and what it assumes. This is not legal advice, and it does not decide who is right.",
    sampleNote:
      "The sample is a rewritten pack-out notice inspired by a public 2022 news report. It is not the original private letter.",
    languageLegend: "Answer in",
    attach: "Attach photo or PDF",
    send: "Send",
    newChat: "New letter",
    sample: "Try the sample notice",
    tryFact:
      "Add a corridor fact: 400,000 FCFA for 12 months, two months left, not travelling",
    composeLetter: "Paste a letter, or attach a photo or PDF",
    composeFact: "A fact that was not on the page",
    fileClear: "Remove",
    reading: "Reading the page…",
    failed: "Read failed",
    labels: {
      WHAT_IT_ASKS: "What it asks",
      WHAT_IT_NEVER_SAYS: "What it never says",
      WHAT_IT_ASSUMES: "What it assumes",
      WHAT_TO_ASK: "What to ask",
      YOUR_TURN: "Your turn",
    },
  },
  French: {
    title: "Lettre de cité",
    intro:
      "Envoyez la page — collez-la, ou joignez une photo ou un PDF. Je dirai ce qu’elle demande, ce qu’elle ne dit jamais, et ce qu’elle suppose. Ce n’est pas un conseil juridique, et ça ne décide pas qui a raison.",
    sampleNote:
      "L’exemple est un avis de déménagement réécrit, inspiré d’un reportage public de 2022. Ce n’est pas la lettre privée originale.",
    languageLegend: "Répondre en",
    attach: "Joindre une photo ou un PDF",
    send: "Envoyer",
    newChat: "Nouvelle lettre",
    sample: "Essayer l’avis d’exemple",
    tryFact:
      "Ajouter un fait du couloir : 400 000 FCFA pour 12 mois, deux mois restants, je ne voyage pas",
    composeLetter: "Collez une lettre, ou joignez une photo ou un PDF",
    composeFact: "Un fait qui n’était pas sur la page",
    fileClear: "Retirer",
    reading: "Lecture de la page…",
    failed: "La lecture a échoué",
    labels: {
      WHAT_IT_ASKS: "Ce qu’elle demande",
      WHAT_IT_NEVER_SAYS: "Ce qu’elle ne dit jamais",
      WHAT_IT_ASSUMES: "Ce qu’elle suppose",
      WHAT_TO_ASK: "Questions à poser",
      YOUR_TURN: "À vous",
    },
  },
};

function parseBlocks(text: string): Blocks {
  const result = Object.fromEntries(MARKERS.map((m) => [m, ""])) as Blocks;
  const pattern =
    /^(WHAT_IT_ASKS|WHAT_IT_NEVER_SAYS|WHAT_IT_ASSUMES|WHAT_TO_ASK|YOUR_TURN):\s*/gm;
  const matches = [...text.matchAll(pattern)];
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1] as (typeof MARKERS)[number];
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    result[key] = text.slice(start, end).trim();
  }
  return result;
}

// Browser File → raw base64 (strip the data:…;base64, prefix)
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("English");
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = COPY[language];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function resetComposer() {
    setDraft("");
    setFile(null);
    setFileKey((n) => n + 1);
  }

  function newLetter() {
    setSource(null);
    setFacts([]);
    setMessages([]);
    setLoading(false);
    resetComposer();
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim();
    const attached = file;
    if (loading) return;
    if (!source && !attached && !text) return;
    if (source && !attached && !text) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: attached ? text || attached.name : text,
      fileName: attached?.name,
      imageUrl:
        attached && attached.type.startsWith("image/")
          ? URL.createObjectURL(attached)
          : undefined,
    };

    const nextFacts =
      source && !attached && text ? [...facts, text] : attached ? [] : facts;

    setMessages((current) => [...current, userMessage]);
    resetComposer();
    setLoading(true);

    try {
      let nextSource = source;
      // New photo/PDF replaces the letter. Follow-up text is extraFact, not a new page.
      if (attached) {
        nextSource = {
          kind: "file",
          file: {
            mimeType: attached.type || "application/pdf",
            data: await fileToBase64(attached),
            name: attached.name,
          },
        };
      } else if (!nextSource) {
        nextSource = { kind: "letter", letter: text };
      }

      setSource(nextSource);
      setFacts(nextFacts);

      const payload: {
        language: Language;
        letter?: string;
        extraFact?: string;
        file?: { mimeType: string; data: string };
      } = { language };

      if (nextSource.kind === "file") payload.file = nextSource.file;
      else payload.letter = nextSource.letter;
      if (nextFacts.length > 0) payload.extraFact = nextFacts.join("\n");

      const res = await fetch("/api/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? copy.failed);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          blocks: parseBlocks(data.text),
        },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          error: err instanceof Error ? err.message : copy.failed,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const canSend = file !== null || draft.trim().length > 0;
  const hasRead = messages.some((message) => message.role === "assistant" && message.blocks);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight">{copy.title}</h1>
          <fieldset className="mt-1 flex gap-3 text-xs text-zinc-600">
            <legend className="sr-only">{copy.languageLegend}</legend>
            {LANGUAGES.map((lang) => (
              <label key={lang} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="language"
                  value={lang}
                  checked={language === lang}
                  onChange={() => setLanguage(lang)}
                />
                {lang}
              </label>
            ))}
          </fieldset>
        </div>
        <button
          type="button"
          onClick={newLetter}
          className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700"
        >
          {copy.newChat}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <article className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3 text-sm text-zinc-800">
          {copy.intro}
        </article>

        {messages.map((message) =>
          message.role === "user" ? (
            <article
              key={message.id}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-3 text-sm text-white"
            >
              {message.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.imageUrl}
                  alt={message.fileName ?? ""}
                  className="mb-2 max-h-48 rounded-md"
                />
              ) : null}
              {message.fileName ? (
                <p className="mb-1 text-xs text-zinc-300">{message.fileName}</p>
              ) : null}
              <p className="whitespace-pre-wrap">{message.text}</p>
            </article>
          ) : (
            <article
              key={message.id}
              className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3 text-sm text-zinc-800"
            >
              {message.error ? (
                <p className="text-red-600">{message.error}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {MARKERS.map((marker) => (
                    <section key={marker}>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {copy.labels[marker]}
                      </h2>
                      <p className="mt-1 whitespace-pre-wrap">
                        {message.blocks?.[marker] || "—"}
                      </p>
                    </section>
                  ))}
                </div>
              )}
            </article>
          ),
        )}

        {loading ? (
          <article className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
            {copy.reading}
          </article>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-zinc-200 px-4 py-3">
        {!source && !loading ? (
          <div className="mb-3 flex flex-col gap-2">
            <button
              type="button"
              className="w-fit rounded-full bg-zinc-100 px-3 py-1.5 text-left text-xs text-zinc-700"
              onClick={() => void send(SAMPLE_LETTER)}
            >
              {copy.sample}
            </button>
            <p className="text-xs text-zinc-500">{copy.sampleNote}</p>
          </div>
        ) : null}

        {hasRead && facts.length === 0 && !loading ? (
          <button
            type="button"
            className="mb-3 w-fit rounded-full bg-zinc-100 px-3 py-1.5 text-left text-xs text-zinc-700"
            onClick={() => setDraft(SAMPLE_FACT)}
          >
            {copy.tryFact}
          </button>
        ) : null}

        {file ? (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
            <span className="min-w-0 truncate">{file.name}</span>
            <button
              type="button"
              className="ml-auto shrink-0 underline"
              onClick={() => {
                setFile(null);
                setFileKey((n) => n + 1);
              }}
            >
              {copy.fileClear}
            </button>
          </div>
        ) : null}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {/* Hidden picker; the + button opens it */}
          <input
            key={fileKey}
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            aria-label={copy.attach}
            title={copy.attach}
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-lg text-zinc-700"
          >
            +
          </button>
          <textarea
            rows={1}
            value={draft}
            placeholder={source ? copy.composeFact : copy.composeLetter}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || !canSend}
            className="h-10 shrink-0 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {copy.send}
          </button>
        </form>
      </footer>
    </main>
  );
}
