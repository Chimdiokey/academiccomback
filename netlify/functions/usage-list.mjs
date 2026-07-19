// Returns the usage log for the admin page (newest first, capped at 500).
// Deliberately unauthenticated — low stakes, per the build brief.

import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("usage");
  const { blobs } = await store.list({ prefix: "usage:" });
  const keys = blobs
    .map((b) => b.key)
    .sort()
    .reverse()
    .slice(0, 500);

  const entries = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));
  return Response.json({ entries: entries.filter(Boolean) });
};

export const config = { path: "/api/usage-list" };
