#!/usr/bin/env python3
"""Film cuts of the raw screen recordings, at exactly each slot's length.

The film plays docs/video/cut/<file> when it exists (else the raw take from its first frame). A raw take is usually longer
than its slot (a live run takes minutes), so this script keeps the chosen spans, speeds up the waits it is told to, and pads
a short take with its own last frame so a slot never runs out of picture.

  python3 video/scripts/cut.py --probe          # raw durations against slot lengths; writes nothing
  python3 video/scripts/cut.py                  # every enabled slot with a raw take
  python3 video/scripts/cut.py R05 R09          # these slots only

docs/video/cuts.json: {"R05": {"segments": [{"from": 0, "to": 6}, {"from": 6, "to": 190, "speed": 6}, {"from": 190}]}}
Times are seconds into the raw take; a negative "from" counts back from its end; "to" omitted means the end; an optional
"crop": "w:h:x:y" (16:9, raw pixels) zooms a span onto one panel. A top-level "fade": seconds dissolves between spans.
Without an entry a slot takes the first N seconds. Output: H.264 CRF 14, yuv420p, 30 fps, 1920x1080, no audio.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "docs/video/raw")
CUT = os.path.join(ROOT, "docs/video/cut")
FPS = 30


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def plan(slot, spec, dur):
    segs = spec.get("segments") if spec else None
    if not segs:
        return [(0.0, min(dur, slot["seconds"]), 1.0, None)]
    out = []
    for s in segs:
        a = s.get("from", 0.0)
        a = dur + a if a < 0 else a
        b = s.get("to")
        b = dur if b is None else (dur + b if b < 0 else b)
        a, b = max(0.0, min(a, dur)), max(0.0, min(b, dur))
        if b > a:
            out.append((a, b, float(s.get("speed", 1.0)), s.get("crop")))
    return out


def cut(slot, spec):
    src = os.path.join(RAW, slot["file"])
    dur = duration(src)
    segs = plan(slot, spec, dur)
    target = float(slot["seconds"])
    parts, labels = [], []
    for i, (a, b, sp, crop) in enumerate(segs):
        cr = f"crop={crop}," if crop else ""
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{sp},fps={FPS},{cr}scale=1920:1080:flags=lanczos,setsar=1[s{i}]")
        labels.append(f"[s{i}]")
    kept = sum((b - a) / sp for a, b, sp, _ in segs)
    fade = float(spec.get("fade", 0)) if spec else 0.0
    if fade and len(segs) > 1:
        # Short dissolves between spans (each costs `fade` seconds of picture).
        acc, prev = 0.0, "[s0]"
        for i in range(1, len(segs)):
            acc += (segs[i - 1][1] - segs[i - 1][0]) / segs[i - 1][2] - fade
            out = "[c]" if i == len(segs) - 1 else f"[x{i}]"
            parts.append(f"{prev}[s{i}]xfade=transition=fade:duration={fade}:offset={acc:.3f}{out}")
            prev = out
        kept -= fade * (len(segs) - 1)
        chain = ";".join(parts) + ";"
    else:
        chain = ";".join(parts) + f";{''.join(labels)}concat=n={len(labels)}:v=1:a=0[c];"
    chain += f"[c]tpad=stop_mode=clone:stop_duration={max(0.0, target - kept) + 1:.3f},trim=duration={target:.3f},setpts=PTS-STARTPTS,format=yuv420p[v]"
    os.makedirs(CUT, exist_ok=True)
    dst = os.path.join(CUT, slot["file"])
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-filter_complex", chain, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium",
                    "-crf", "14", "-r", str(FPS), dst], check=True)
    got = duration(dst)
    pad = max(0.0, target - kept)
    print(f"{slot['id']}  raw {dur:6.1f} s  kept {kept:5.1f} s  {'padded %.1f s' % pad if pad > 0.05 else ''}  -> {got:.2f} s (slot {target:.0f})")


def main():
    args = sys.argv[1:]
    probe = "--probe" in args
    ids = [a for a in args if not a.startswith("--")]
    slots = json.load(open(os.path.join(ROOT, "docs/video/slots.json")))["slots"]
    cp = os.path.join(ROOT, "docs/video/cuts.json")
    specs = json.load(open(cp)) if os.path.exists(cp) else {}
    for s in slots:
        if not s["enabled"] or (ids and s["id"] not in ids):
            continue
        src = os.path.join(RAW, s["file"])
        if not os.path.exists(src):
            print(f"{s['id']}  no raw take ({s['file']})")
            continue
        if probe:
            print(f"{s['id']}  raw {duration(src):6.1f} s  slot {s['seconds']} s  {s['file']}")
            continue
        cut(s, specs.get(s["id"]))


if __name__ == "__main__":
    main()
