// Thin proxy: forwards one audio chunk to Groq's Whisper API and returns the text.
// No audio or transcripts are stored anywhere. Mind the 10s free-tier timeout —
// this function must never do more than a single forward-and-return.

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "server_not_configured", message: "GROQ_API_KEY is not set in Netlify environment variables." },
      { status: 500 }
    );
  }

  let audio;
  try {
    audio = await req.arrayBuffer();
  } catch {
    return Response.json({ error: "bad_request", message: "Could not read the audio payload." }, { status: 400 });
  }
  if (!audio || audio.byteLength === 0) {
    return Response.json({ error: "bad_request", message: "Empty audio payload." }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "chunk.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");

  let groqRes;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    return Response.json(
      { error: "upstream_unreachable", message: "Could not reach the transcription service." },
      { status: 502 }
    );
  }

  if (groqRes.status === 429) {
    return Response.json(
      { error: "rate_limited", message: "The shared free transcription quota is briefly maxed out." },
      { status: 429 }
    );
  }

  if (!groqRes.ok) {
    let detail = "";
    try {
      detail = (await groqRes.json())?.error?.message ?? "";
    } catch {
      // upstream error body wasn't JSON; fall back to status code
    }
    return Response.json(
      { error: "transcription_failed", message: detail || `Transcription service error (${groqRes.status}).` },
      { status: 502 }
    );
  }

  const data = await groqRes.json();
  return Response.json({ text: data.text ?? "" });
};

export const config = { path: "/api/transcribe" };
