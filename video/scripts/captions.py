#!/usr/bin/env python3
"""Caption cues for the film from the narration sidecars (docs/video/audio/aNN.json, ElevenLabs word timings).

The sidecar words are the spoken text (respellings such as "Nemmo-tron"); the captions show the written text. Each written
word is respelled on its own to learn how many spoken words it became, so its time is the span of those spoken words.
Cues are short lines (at most MAX characters), broken at punctuation where possible.

  python3 video/scripts/captions.py      # writes video/src/data/captions.generated.json
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from tts import spoken  # noqa: E402  (same respelling rules as the narration)

MAX = 58
OUT = os.path.join(ROOT, "video/src/data/captions.generated.json")


def timed_words(side):
    written = side["text_original"].split()
    words = side["words"]
    out, k = [], 0
    for i, w in enumerate(written):
        n = len(spoken(w).split())
        nxt = written[i + 1].lower().strip(".,;:") if i + 1 < len(written) else ""
        if w.startswith("$") and nxt in ("million", "billion"):
            n = 1  # "$1.28 million" is spoken "1.28 million dollars": the "dollars" token belongs to the next word
        if w.lower().strip(".,;:") in ("million", "billion") and i > 0 and written[i - 1].startswith("$"):
            n += 1
        n = max(1, n)
        span = words[k:k + n]
        if not span:
            return None
        out.append({"w": w, "s": span[0]["start"], "e": span[-1]["end"]})
        k += n
    return out if k == len(words) else None


def proportional(side):
    written = side["text_original"].split()
    total = side["seconds"]
    chars = sum(len(w) + 1 for w in written)
    t, out = 0.0, []
    for w in written:
        d = total * (len(w) + 1) / chars
        out.append({"w": w, "s": t, "e": t + d})
        t += d
    return out


def cues(words):
    res, cur = [], []
    for i, x in enumerate(words):
        cur.append(x)
        line = " ".join(c["w"] for c in cur)
        nxt = words[i + 1]["w"] if i + 1 < len(words) else None
        soft = re.search(r"[,;:.]$", x["w"]) and len(line) > 28
        if nxt is None or soft or len(line + " " + nxt) > MAX:
            res.append({"text": line, "start": round(cur[0]["s"], 3), "end": round(cur[-1]["e"], 3)})
            cur = []
    return res


def main():
    script = json.load(open(os.path.join(ROOT, "video/script.json")))
    out = {}
    for n in script["narration"]:
        sid = n["audio"].split(".")[0]
        p = os.path.join(ROOT, "docs/video/audio", f"{sid}.json")
        if not os.path.exists(p):
            continue
        side = json.load(open(p))
        words = timed_words(side)
        mode = "aligned"
        if words is None:
            words, mode = proportional(side), "proportional"
        out[sid] = cues(words)
        print(f"{sid}  {len(out[sid])} cues  {mode}")
    json.dump(out, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()
