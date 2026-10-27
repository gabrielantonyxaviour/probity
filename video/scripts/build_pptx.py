"""Build the Probity deck: one PPTX slide per deck.json slide, each a full-bleed clip that plays on entry.

Adapted from Lockgate pitch/deck/scripts/build_pptx.py. With --film, one DeckSilent render is cut at each slide's
offsets, so every clip starts on the previous clip's last frame and clicking through plays as one film; PowerPoint and
Keynote hold the last frame until the next click. Speaker notes carry the narration line for that slide.
The PDF is made from each clip's held (last) frame. Slides 1-3 carry the synthetic-data footer inside the frame.

Usage (from video/):  python3 scripts/build_pptx.py --film out/deck-silent.mp4 --out ../docs/deck/probity-deck.pptx
Needs: python-pptx, lxml, Pillow, ffmpeg on PATH.
"""

import argparse
import json
import subprocess
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.util import Emu

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
FPS = 30

# PowerPoint's "Start: Automatically" for one media shape. Keynote rejects whitespace text nodes here (remove_blank_text).
AUTOPLAY = (
    '<p:timing xmlns:p="{P}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
    '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>'
    '<p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par>'
    '<p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect">'
    '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr>'
    '<p:cTn id="6" dur="{dur}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn>'
    '</p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>'
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
    # No end condition and no showWhenStopped: Keynote auto-advanced slides with onStopAudio here.
    '<p:video><p:cMediaNode vol="80000"><p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn>'
    '<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cMediaNode></p:video></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def cut(src: Path, a: int, b: int, clip: Path, poster: Path, held: Path) -> None:
    """Frames [a, b) of the film -> silent H.264 clip, its first frame (poster) and its last frame (held)."""
    vf = f"trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", vf, "-an", "-c:v", "libx264", "-crf", "16",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(clip)])
    run(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-frames:v", "1", str(poster)])
    # last frame: seek from the end of the clip
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.05", "-i", str(clip), "-update", "1", "-frames:v", "1", str(held)])


def set_autoplay(slide, movie, dur_ms: int) -> None:
    sld = slide._element
    for old in sld.findall(f"{{{P}}}timing"):
        sld.remove(old)
    parser = etree.XMLParser(remove_blank_text=True)
    timing = etree.fromstring(AUTOPLAY.format(P=P, dur=dur_ms, spid=movie.shape_id), parser)
    ext = sld.find(f"{{{P}}}extLst")
    (ext.addprevious(timing) if ext is not None else sld.append(timing))


def register_notes_master(prs) -> None:
    """python-pptx creates the notes master part but not presentation.xml's notesMasterIdLst; Keynote needs it."""
    pres = prs.part._element
    if pres.find(f"{{{P}}}notesMasterIdLst") is not None:
        return
    rid = next(r.rId for r in prs.part.rels.values() if r.reltype == RT.NOTES_MASTER)
    lst = etree.SubElement(pres, f"{{{P}}}notesMasterIdLst")
    etree.SubElement(lst, f"{{{P}}}notesMasterId").set(f"{{{R}}}id", rid)
    pres.find(f"{{{P}}}sldMasterIdLst").addnext(lst)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--film", default="out/deck-silent.mp4", help="DeckSilent render to cut every clip from")
    ap.add_argument("--out", default="../docs/deck/probity-deck.pptx")
    ap.add_argument("--pdf", default="", help="PDF path (default: next to the pptx, same stem)")
    ap.add_argument("--work", default="out/deck-clips")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    slides = json.loads((root / "deck.json").read_text())["slides"]
    work = root / args.work
    work.mkdir(parents=True, exist_ok=True)
    out = (root / args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    pdf = Path(args.pdf).resolve() if args.pdf else out.with_suffix(".pdf")
    film = root / args.film

    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)
    blank = prs.slide_layouts[6]
    held_frames: list[Path] = []
    start = 0
    for s in slides:
        n = round(s["seconds"] * FPS)
        clip, poster, held = work / f"{s['id']}.mp4", work / f"{s['id']}.png", work / f"{s['id']}-held.png"
        cut(film, start, start + n, clip, poster, held)
        start += n
        slide = prs.slides.add_slide(blank)
        movie = slide.shapes.add_movie(str(clip), 0, 0, prs.slide_width, prs.slide_height,
                                       poster_frame_image=str(poster), mime_type="video/mp4")
        movie.name = f"{s['id']} {s['title']}"
        set_autoplay(slide, movie, round(n / FPS * 1000))
        slide.notes_slide.notes_text_frame.text = s["note"]
        held_frames.append(held)
    register_notes_master(prs)
    prs.core_properties.title = "Probity: before the money moves, prove who is asking"
    prs.core_properties.author = "Team Zen"
    prs.save(out)

    pages = [Image.open(p).convert("RGB") for p in held_frames]
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=144.0)
    notes = ["# Probity deck speaker notes\n"] + [f"## {i + 1}. {s['title']}\n\n{s['note']}\n" for i, s in enumerate(slides)]
    (out.parent / "notes.md").write_text("\n".join(notes))
    print(out, len(prs.slides._sldIdLst), "slides;", pdf)


if __name__ == "__main__":
    main()
