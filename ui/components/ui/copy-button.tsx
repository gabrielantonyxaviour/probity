"use client";
import { Copy } from "lucide-react";
import { IconButton } from "./button";
import { notify } from "./toast";
import { log } from "@/lib/log";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) {
      log.warn({ e }, "clipboard unavailable");
      return false;
    }
  }
}

export function CopyIconButton({ text, label, toast }: { text: string; label: string; toast: string }) {
  return (
    <IconButton
      label={label}
      small
      onClick={async () => {
        const ok = await copyText(text);
        notify(ok ? toast : "Couldn't copy", ok ? "agree" : "conflict");
      }}
    >
      <Copy />
    </IconButton>
  );
}
