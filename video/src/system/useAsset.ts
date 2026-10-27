import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const cache = new Map<string, boolean>();

async function probe(path: string, kind: "video" | "audio"): Promise<boolean> {
  try {
    const res = await fetch(staticFile(path), { headers: { Range: "bytes=0-0" } });
    const type = res.headers.get("content-type") ?? "";
    void res.body?.cancel();
    return res.ok && (type.startsWith(kind) || type.startsWith("application/octet-stream") || type.startsWith("audio/") || type.startsWith("video/"));
  } catch {
    return false;
  }
}

/** true when public/<path> exists. Render waits for the probe, so a dropped-in recording needs no code change. */
export function useAssetExists(path: string, kind: "video" | "audio"): boolean {
  const key = `${kind}:${path}`;
  const [exists, setExists] = useState<boolean | undefined>(cache.get(key));
  const [handle] = useState(() => (cache.has(key) ? null : delayRender(`probe ${path}`)));
  useEffect(() => {
    if (cache.has(key)) {
      if (handle !== null) continueRender(handle);
      return;
    }
    probe(path, kind).then((ok) => {
      cache.set(key, ok);
      setExists(ok);
      if (handle !== null) continueRender(handle);
    });
  }, [key, path, kind, handle]);
  return exists === true;
}
