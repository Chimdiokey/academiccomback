// Lightweight self-reported usage log — NOT authentication.
// Stores only: name, timestamp, approximate audio duration, file count.

import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Expected a JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) {
    return Response.json({ error: "bad_request", message: "Name is required." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().slice(0, 200) || null;

  const entry = {
    name,
    email,
    timestamp: new Date().toISOString(),
    durationSec: Math.max(0, Math.round(Number(body.durationSec) || 0)),
    fileCount: Math.max(1, Math.round(Number(body.fileCount) || 1)),
  };

  const store = getStore("usage");
  const key = `usage:${entry.timestamp}:${Math.random().toString(36).slice(2, 8)}`;
  await store.setJSON(key, entry);

  return Response.json({ ok: true });
};

export const config = { path: "/api/log-usage" };
