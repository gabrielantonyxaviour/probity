#!/usr/bin/env python3
"""Narration in Gabriel's ElevenLabs voice (instant clone "Gabriel"). Adapted from Lockgate pitch/founder-house/tts_fh.py.

Recipe (wave1-decisions item 7): voice v7li4BiiSMnJL2FCuD6D, model eleven_v4, seed 4242, stability .5, similarity .8,
speaker boost, then ffmpeg atempo 1.04, with the with-timestamps endpoint giving word timings for captions.

Run from the repo root:
  python3 video/scripts/tts.py --plan                       # spoken text, characters and window per segment; no API call
  python3 video/scripts/tts.py a01 a04                      # synthesize these segments into docs/video/audio/
  python3 video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio z01 z02
  python3 video/scripts/tts.py --facts path/to/facts.json   # resolve {{FILL}} tokens from another facts file (marks output provisional)

The key is read from ELEVENLABS_API_KEY or probity/.env.local and is never printed. Every call adds its characters to
docs/video/tts-usage.json; the run stops before the cumulative total passes --budget (default 25000 characters).
Output per segment: <id>.m4a (AAC 160k, atempo applied) and <id>.json {words:[{word,start,end}], seconds, text_original,
text_spoken, provisional, window_seconds}.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VOICE = "v7li4BiiSMnJL2FCuD6D"
MODEL = "eleven_v4"
SEED = 4242
TEMPO = 1.04
NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]

# Respellings so the clone says the names the way people do. Applied to the spoken text only; the sidecar keeps the original.
PRONOUNCE = [
    (r"\bNemotron\b", "Nemmo-tron"),
    (r"\bZetaris\b", "Zeh-tarris"),
    (r"\bEDGAR\b", "Edgar"),
    (r"\bUEIs?\b", lambda m: "U-E-I" + ("s" if m.group(0).endswith("s") else "")),
    (r"\bUSAspending\b", "U.S.A. spending"),
    (r"\bNVIDIA\b", "Nvidia"),
    (r"\bUSL\b", "U-S-L"),
    (r"\bDQ(\d?)\b", lambda m: "D-Q" + (" " + NUMBER_WORDS[int(m.group(1))] if m.group(1) else "")),
    (r"\bCIK\b", "C-I-K"),
    (r"\bERP\b", "E-R-P"),
    (r"\bSQL\b", "sequel"),
    (r"\bCACI\b", "Kay-sigh"),
    (r"\bSAIC\b", "Sigh-ick"),
    (r"\bL3Harris\b", "L-three Harris"),
    (r"\bV2X\b", "V-two-X"),
    (r"\bBEC\b", "B-E-C"),
    (r"\bAFP\b", "A-F-P"),
    (r"\bIC3\b", "I-C-three"),
]


def read_key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if k:
        return k
    env = os.path.join(ROOT, ".env.local")
    if os.path.exists(env):
        for line in open(env, encoding="utf8"):
            m = re.match(r"\s*ELEVENLABS_API_KEY\s*=\s*(.*?)\s*$", line)
            if m:
                return m.group(1).strip("'\"")
    sys.exit("tts.py: ELEVENLABS_API_KEY is not set and not in .env.local")


def load_facts(path):
    try:
        d = json.load(open(path, encoding="utf8"))
    except OSError:
        return None
    return None if d.get("pending") else d


def fills(facts):
    """Spoken values for the {{FILL}} tokens. The sweep count is distinct payment items (a finding is a rule hit, and one
    item can trip DQ1 and DQ2), which is the figure the money total adds up to."""
    if not facts:
        return {}
    items = {s["item_id"] for s in facts["sweep"]}
    d = facts.get("days_before_payment")
    q8 = facts.get("q8_seconds")
    return {
        "days_before_payment_words": NUMBER_WORDS[d] if d is not None and d < len(NUMBER_WORDS) else str(d),
        "exposure_millions": "%.2f" % (facts["vendor_amount_usd"] / 1_000_000),
        "sweep_count_words": NUMBER_WORDS[len(items)] if len(items) < len(NUMBER_WORDS) else str(len(items)),
        "q8_seconds": str(round(q8)) if q8 is not None else None,
    }


def resolve(text, values):
    missing = []

    def sub(m):
        v = values.get(m.group(1))
        if v is None:
            missing.append(m.group(1))
            return m.group(0)
        return v

    out = re.sub(r"\{\{(\w+)\}\}", sub, text)
    return out, missing


def spoken(text):
    t = re.sub(r"\$(\d[\d.,]*) (million|billion)", r"\1 \2 dollars", text)
    t = t.replace("$", "")
    for pat, rep in PRONOUNCE:
        t = re.sub(pat, rep, t)
    return t


def load_segments(script_path):
    d = json.load(open(script_path, encoding="utf8"))
    if isinstance(d, dict) and "narration" in d:  # video/script.json
        slots = json.load(open(os.path.join(ROOT, "docs/video/slots.json"), encoding="utf8"))["slots"]
        length = {m["id"]: m["seconds"] for m in d["motion"]}
        length.update({s["id"]: (s["seconds"] if s["enabled"] else 0) for s in slots})
        segs = []
        for n in d["narration"]:
            segs.append({
                "id": n["audio"].split(".")[0],
                "text": n.get("text_fit") or n["text"],
                "window": sum(length.get(c, 0) for c in n["covers"]),
                "note": n["label"],
            })
        return segs
    return [{"id": s["id"], "text": s["text"], "window": s.get("window_seconds"), "note": s.get("note", "")} for s in d]


def words_of(t):
    return re.findall(r"[\w'.$-]+", t.lower())


def apply_trims(segs):
    """docs/video/narration-trims.json {id: text}: a further trim of the approved text. It may only delete words from the
    approved narration (text_fit when present, else text), never add or reorder them."""
    p = os.path.join(ROOT, "docs/video/narration-trims.json")
    if not os.path.exists(p):
        return segs
    trims = json.load(open(p, encoding="utf8"))
    for s in segs:
        if s["id"] not in trims:
            continue
        base, new = words_of(s["text"]), words_of(trims[s["id"]])
        it = iter(base)
        if not all(w in it for w in new):
            sys.exit(f"tts.py: the trim for {s['id']} adds or reorders words; trims may only delete words from the approved narration")
        s["text"] = trims[s["id"]]
        s["note"] += " (trimmed further)"
    return segs


def ledger_path():
    return os.path.join(ROOT, "docs/video/tts-usage.json")


def used():
    p = ledger_path()
    return json.load(open(p))["characters"] if os.path.exists(p) else 0


def record(chars, ids):
    p = ledger_path()
    d = json.load(open(p)) if os.path.exists(p) else {"characters": 0, "calls": []}
    d["characters"] += chars
    d["calls"].append({"ids": ids, "characters": chars})
    json.dump(d, open(p, "w"), indent=2)


def synthesize(seg, text, key, out_dir, provisional, original):
    body = {
        "text": text,
        "model_id": MODEL,
        "seed": SEED,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0, "use_speaker_boost": True, "speed": 1.0},
    }
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    try:
        d = json.load(urllib.request.urlopen(req, timeout=180))
    except urllib.error.HTTPError as e:
        sys.exit(f"tts.py: ElevenLabs answered {e.code} for {seg['id']}: {e.read()[:200].decode('utf8', 'replace')}")
    raw = os.path.join(out_dir, f"{seg['id']}.raw.mp3")
    open(raw, "wb").write(base64.b64decode(d["audio_base64"]))
    final = os.path.join(out_dir, f"{seg['id']}.m4a")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-filter:a", f"atempo={TEMPO}", "-c:a", "aac", "-b:a", "160k", final], check=True)
    os.remove(raw)
    a = d["alignment"]
    st = [t / TEMPO for t in a["character_start_times_seconds"]]
    en = [t / TEMPO for t in a["character_end_times_seconds"]]
    words, cur, s0, pe = [], "", None, 0
    for c, s, e in zip(a["characters"], st, en):
        if c.isspace():
            if cur:
                words.append({"word": cur, "start": round(s0, 3), "end": round(pe, 3)})
                cur = ""
        else:
            if not cur:
                s0 = s
            cur += c
            pe = e
    if cur:
        words.append({"word": cur, "start": round(s0, 3), "end": round(pe, 3)})
    seconds = round(en[-1], 2)
    json.dump({"id": seg["id"], "text_original": original, "text_spoken": text, "words": words, "seconds": seconds,
               "window_seconds": seg["window"], "provisional": provisional, "voice": VOICE, "model": MODEL, "seed": SEED, "tempo": TEMPO},
              open(os.path.join(out_dir, f"{seg['id']}.json"), "w"), indent=1)
    return seconds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="segment ids (a01, z02); default all")
    ap.add_argument("--script", default=os.path.join(ROOT, "video/script.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "docs/video/audio"))
    ap.add_argument("--facts", default=os.path.join(ROOT, "video/src/data/facts.generated.json"))
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--budget", type=int, default=25000)
    ap.add_argument("--skip-zero-window", action="store_true", help="skip segments whose slots are disabled (window 0 s)")
    args = ap.parse_args()

    facts_given = args.facts != os.path.join(ROOT, "video/src/data/facts.generated.json")
    facts = load_facts(args.facts)
    values = fills(facts)
    provisional = facts_given  # the canonical facts file is the recorded run; any other file is a stand-in
    segs = [s for s in apply_trims(load_segments(args.script)) if not args.ids or s["id"] in args.ids] if args.script.endswith("video/script.json") else [s for s in load_segments(args.script) if not args.ids or s["id"] in args.ids]
    plan, total = [], 0
    for s in segs:
        if args.skip_zero_window and s["window"] == 0:
            continue
        text, missing = resolve(s["text"], values)
        plan.append((s, text, missing))
        total += len(spoken(text))
    print(f"{'id':5} {'chars':>5} {'window':>6} {'words':>5}  note")
    for s, text, missing in plan:
        w = len(spoken(text).split())
        print(f"{s['id']:5} {len(spoken(text)):5} {str(s['window']):>6} {w:5}  {s['note']}{'  UNRESOLVED ' + ','.join(missing) if missing else ''}")
    print(f"total {total} characters; used before this run {used()}; budget {args.budget}")
    if args.plan:
        return
    blocked = [(s['id'], m) for s, _, m in plan if m]
    if blocked:
        sys.exit(f"tts.py: unresolved fill tokens {blocked}; run video/scripts/facts.ts first or pass --facts FILE")
    if used() + total > args.budget:
        sys.exit(f"tts.py: {used()} + {total} characters would pass the {args.budget} budget; nothing was sent")
    key = read_key()
    os.makedirs(args.out, exist_ok=True)
    over = []
    for s, text, _ in plan:
        sp = spoken(text)
        secs = synthesize(s, sp, key, args.out, provisional, text)
        record(len(sp), [s["id"]])
        flag = ""
        if s["window"]:
            flag = "  OVER WINDOW" if secs > s["window"] else f"  fits ({s['window'] - secs:.1f} s spare)"
            if secs > s["window"]:
                over.append(s["id"])
        print(f"{s['id']} {secs} s (window {s['window']}){flag}", flush=True)
    if over:
        print(f"over window: {', '.join(over)}; trim within the approved narration (video/script.json text_fit) and re-run those ids", file=sys.stderr)


if __name__ == "__main__":
    main()
