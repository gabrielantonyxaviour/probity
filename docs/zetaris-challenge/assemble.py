#!/usr/bin/env python3
"""Assemble the Zetaris challenge cut from cut.json, the zNN narration and the recordings. Run from probity/:

  python3 docs/zetaris-challenge/assemble.py                    # all segments -> _docs/ZEN_291026.mp4
  python3 docs/zetaris-challenge/assemble.py --only z06 z07     # build those segments only (kept in build/)
  python3 docs/zetaris-challenge/assemble.py --no-captions
  python3 docs/zetaris-challenge/assemble.py --copy ZEN_DDMMYY.mp4   # also write this copy next to the output

Each segment is as long as its narration plus the gap in cut.json. Its clips are cut with ss/t (seconds), scaled to
1920x1080 and joined; when they are shorter than the segment the last frame is held, when longer the end is cut.
Captions are the spoken text, phrase by phrase, timed from the word timestamps in zNN.json. ffmpeg here has no
drawtext/libass, so each caption is a PNG (Pillow) laid over the video with the overlay filter.
"""
import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(HERE, "build")
W, H, FPS = 1920, 1080, 30
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def load_spoken():
    spec = importlib.util.spec_from_file_location("tts", os.path.join(ROOT, "video/scripts/tts.py"))
    tts = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tts)
    return tts.spoken


def phrases(text, max_words=10):
    """Clause chunks of the original text: split at punctuation, merge short clauses inside a sentence up to max_words,
    and split a long clause evenly."""
    out = []
    for sent in re.findall(r"[^.!?:]+[.!?:]?", text):
        if not sent.split():
            continue
        cur = []
        for frag in re.split(r"(?<=[,;])\s+", sent.strip()):
            w = frag.split()
            if len(cur) >= 4 and len(cur) + len(w) > max_words:
                out.append(" ".join(cur))
                cur = []
            cur += w
            while len(cur) > max_words + 3:
                half = -(-len(cur) // 2)
                out.append(" ".join(cur[:half]))
                cur = cur[half:]
        if cur:
            out.append(" ".join(cur))
    return out


def caption_png(text, path):
    font = ImageFont.truetype(FONT, 40)
    maxw = 1500
    lines, cur = [], ""
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    for w in text.split():
        t = (cur + " " + w).strip()
        if probe.textlength(t, font=font) > maxw and cur:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    lh = 54
    tw = int(max(probe.textlength(l, font=font) for l in lines)) + 64
    th = lh * len(lines) + 28
    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, tw - 1, th - 1), radius=16, fill=(12, 12, 11, 205))
    for i, l in enumerate(lines):
        d.text((tw // 2, 14 + i * lh + lh // 2), l, font=font, fill=(244, 241, 232, 255), anchor="mm")
    img.save(path)
    return tw, th


def captions_for(seg_id, spoken):
    a = json.load(open(os.path.join(HERE, "audio", f"{seg_id}.json"), encoding="utf8"))
    words = a["words"]
    items, i = [], 0
    for ph in phrases(a["text_original"]):
        n = len(spoken(ph).split())
        chunk = words[i:i + n]
        i += n
        if chunk:
            items.append((ph, chunk[0]["start"], min(chunk[-1]["end"] + 0.25, a["seconds"] + 0.3)))
    return items, a["seconds"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ffmpeg failed:\n" + " ".join(cmd[:6]) + " ...\n" + r.stderr[-1800:])


def build_segment(seg, gap, tail, spoken, captions, last):
    sid = seg["id"]
    items, secs = captions_for(sid, spoken)
    dur = round(secs + (tail if last else gap), 2)
    inputs, filt = [], []
    for k, c in enumerate(seg["clips"]):
        f = os.path.join(ROOT, c["file"])
        if not os.path.exists(f):
            sys.exit(f"missing footage {c['file']} for {sid}")
        inputs += ["-i", f]
        filt.append(
            f"[{k}:v]trim=start={c.get('ss', 0)}:duration={c['t']},setpts=PTS-STARTPTS,fps={FPS},"
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x0c0c0b,setsar=1,format=yuv420p[c{k}]")
    n = len(seg["clips"])
    filt.append("".join(f"[c{k}]" for k in range(n)) + f"concat=n={n}:v=1:a=0,tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur},setpts=PTS-STARTPTS[v0]")
    last_v = "v0"
    if captions and seg.get("captions", True):
        for j, (txt, a, b) in enumerate(items):
            png = os.path.join(BUILD, f"{sid}-cap{j:02d}.png")
            tw, th = caption_png(txt, png)
            inputs += ["-i", png]
            idx = n + j
            nxt = f"v{j + 1}"
            filt.append(f"[{last_v}][{idx}:v]overlay=x=(W-w)/2:y=H-h-{seg.get('caption_y', 64)}:enable='between(t,{a:.2f},{b:.2f})'[{nxt}]")
            last_v = nxt
    ai = n + (len(items) if captions and seg.get("captions", True) else 0)
    inputs += ["-i", os.path.join(HERE, "audio", f"{sid}.m4a")]
    filt.append(f"[{ai}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={dur}[a]")
    out = os.path.join(BUILD, f"{sid}.mp4")
    run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", f"[{last_v}]", "-map", "[a]",
         "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", str(dur), out])
    return out, dur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cut", default=os.path.join(HERE, "cut.json"))
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--copy", help="also write the final file under this name beside the output")
    ap.add_argument("--out")
    args = ap.parse_args()
    cut = json.load(open(args.cut, encoding="utf8"))
    spoken = load_spoken()
    os.makedirs(BUILD, exist_ok=True)
    built, total = [], 0.0
    for idx, seg in enumerate(cut["segments"]):
        if args.only and seg["id"] not in args.only:
            continue
        path, dur = build_segment(seg, cut.get("gap", 0.6), cut.get("tail", 0.8), spoken, not args.no_captions, idx == len(cut["segments"]) - 1)
        built.append(path)
        total += dur
        print(f"{seg['id']}  {dur:6.2f} s  start {total - dur:6.2f}", flush=True)
    if args.only:
        return
    lst = os.path.join(BUILD, "segments.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in built))
    out = args.out or os.path.abspath(os.path.join(ROOT, "..", "_docs", cut.get("out", "ZEN_291026.mp4")))
    fade = f"fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.8:.2f}:d=0.8"
    run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-vf", fade,
         "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.3,afade=t=out:st={total - 0.6:.2f}:d=0.6",
         "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out])
    print(f"wrote {out}  total {total:.1f} s")
    if args.copy:
        dst = os.path.join(os.path.dirname(out), args.copy)
        shutil.copyfile(out, dst)
        print(f"copy  {dst}")


if __name__ == "__main__":
    main()
