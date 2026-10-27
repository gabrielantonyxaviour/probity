#!/usr/bin/env python3
"""Film v2 timing: one narration segment per shot. Each shot lasts its line plus BREATH seconds, so a shot never cuts while
its line is still being spoken. Writes the shot lengths into video/script.json (motion) and docs/video/slots.json (slots),
and the word-timed beats the scenes key their reveals to into video/src/data/beats.generated.json.

  python3 video/scripts/beats.py      # after tts.py has written docs/video/audio/aNN.json for every narration segment
"""
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BREATH = 0.7
FPS = 30
# Beats: shot -> list of (label, first word of the phrase that triggers it, occurrence).
BEATS = {
    "M02": [("doj", "In", 1), ("ic3", "Last", 1), ("afp", "And", 1)],
    "M05": [("A1", "The", 1), ("A2", "The", 2), ("A3", "The", 3), ("A4", "And", 1)],
    "R05": [("decision", "Decision:", 1)],
}


def main():
    sp = os.path.join(ROOT, "video/script.json")
    script = json.load(open(sp))
    slp = os.path.join(ROOT, "docs/video/slots.json")
    slots = json.load(open(slp))
    lengths, beats = {}, {}
    for n in script["narration"]:
        shot = n["covers"][0]
        side = json.load(open(os.path.join(ROOT, "docs/video/audio", n["audio"].replace(".m4a", ".json"))))
        lengths[shot] = math.ceil((side["seconds"] + BREATH) * FPS) / FPS
        if shot in BEATS:
            out = {}
            for label, word, occ in BEATS[shot]:
                hits = [w for w in side["words"] if w["word"] == word]
                out[label] = round(hits[occ - 1]["start"] * FPS)
            beats[shot] = out
    for m in script["motion"]:
        m["seconds"] = round(lengths[m["id"]], 3)
    for s in slots["slots"]:
        if s["id"] in lengths:
            s["seconds"] = round(lengths[s["id"]], 3)
    total = sum(lengths[i] for i in script["sequence"])
    slots["cap_seconds"] = 235
    json.dump(script, open(sp, "w"), indent=1)
    json.dump(slots, open(slp, "w"), indent=1)
    json.dump(beats, open(os.path.join(ROOT, "video/src/data/beats.generated.json"), "w"), indent=1)
    for i in script["sequence"]:
        print(f"{i}  {lengths[i]:6.2f} s")
    print(f"total {total:.2f} s  beats {beats}")


if __name__ == "__main__":
    main()
