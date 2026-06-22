"""
Threat Level Trivia - Instagram card generator

Pulls questions from js/data.js and renders Instagram-ready post images
(1080x1080 square) in the site's brand style: question card + answer card
(a 2-slide carousel), plus a ready-to-paste caption file.

Usage:
  python tools/ig_card_generator.py --id 12
  python tools/ig_card_generator.py --random --count 3
  python tools/ig_card_generator.py --random --difficulty Medium

Output goes to marketing/instagram/<id>-<slug>/
"""

import argparse
import random
import re
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "js" / "data.js"
OUT_DIR = ROOT / "marketing" / "instagram"

# Brand palette (css/styles.css)
CREAM = "#f2ede4"
CREAM_DARK = "#e5ddd0"
NAVY = "#1c3a5e"
NAVY_LIGHT = "#254d7c"
GRAY = "#6b6b6b"
GRAY_LIGHT = "#a8a094"
GRAY_BORDER = "#c5bdb0"
TEXT = "#2a2a2a"
TEXT_SUB = "#5a5a5a"
CORRECT = "#2d6e45"
CORRECT_BG = "#e8f5ec"
CORRECT_RING = "#94d4ab"
WHITE = "#ffffff"

W, H = 1080, 1080

GEORGIA = "C:/Windows/Fonts/georgia.ttf"
GEORGIA_BOLD = "C:/Windows/Fonts/georgiab.ttf"
GEORGIA_ITALIC = "C:/Windows/Fonts/georgiai.ttf"


def load_questions():
    """Parse the QUESTIONS array out of js/data.js without a JS runtime."""
    src = DATA_JS.read_text(encoding="utf-8")
    m = re.search(r"const QUESTIONS = \[(.*?)\n\];", src, re.DOTALL)
    if not m:
        raise SystemExit("Could not locate QUESTIONS array in js/data.js")
    body = m.group(1)

    str_re = r'"((?:[^"\\]|\\.)*)"'
    questions = []
    for block in re.finditer(r"\{\s*id:\s*(\d+),(.*?)\}\s*,?", body, re.DOTALL):
        qid, fields = int(block.group(1)), block.group(2)

        def field(name):
            fm = re.search(name + r":\s*" + str_re, fields)
            return fm.group(1).replace('\\"', '"').replace("\\'", "'") if fm else None

        dm = re.search(r"distractors:\s*\[(.*?)\]", fields, re.DOTALL)
        distractors = (
            [s.replace('\\"', '"') for s in re.findall(str_re, dm.group(1))] if dm else []
        )
        q = {
            "id": qid,
            "category": field("category"),
            "difficulty": field("difficulty"),
            "question": field("question"),
            "answer": field("answer"),
            "distractors": distractors,
        }
        if q["question"] and q["answer"] and len(distractors) >= 3:
            questions.append(q)
    return questions


def font(path, size):
    return ImageFont.truetype(path, size)


def text_w(draw, s, f):
    box = draw.textbbox((0, 0), s, font=f)
    return box[2] - box[0]


def letterspaced(s, gap=" "):
    return gap.join(list(s))


def wrap_to_width(draw, s, f, max_w):
    """Greedy wrap so each rendered line fits max_w pixels."""
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_w(draw, trial, f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_grid(draw):
    """Faint graph-paper grid like the og-image."""
    step = 54
    for x in range(0, W, step):
        draw.line([(x, 0), (x, H)], fill="#ece6da", width=1)
    for y in range(0, H, step):
        draw.line([(0, y), (W, y)], fill="#ece6da", width=1)


def draw_frame(draw):
    draw.rectangle([28, 28, W - 28, H - 28], outline=GRAY_BORDER, width=2)
    draw.rectangle([40, 40, W - 40, H - 40], outline="#d8d1c3", width=1)


def draw_plane(draw, cx, cy, scale=1.0):
    """Simple paper airplane matching the og-image motif."""
    def pt(x, y):
        return (cx + x * scale, cy + y * scale)

    upper = [pt(-52, 8), pt(52, -26), pt(-4, 18)]
    lower = [pt(-4, 18), pt(52, -26), pt(8, 34)]
    draw.polygon(upper, fill=WHITE, outline=NAVY)
    draw.polygon(lower, fill="#e8e8e8", outline=NAVY)
    draw.line([pt(-52, 8), pt(52, -26)], fill=NAVY, width=3)
    draw.line([pt(-4, 18), pt(52, -26)], fill=NAVY, width=2)
    draw.line([pt(8, 34), pt(52, -26)], fill=NAVY, width=2)


def draw_header(img, draw):
    draw_plane(draw, W // 2, 95, scale=0.9)

    chip_f = font(GEORGIA_BOLD, 28)
    chip_text = letterspaced("THREAT LEVEL")
    cw = text_w(draw, chip_text, chip_f)
    pad = 24
    cx0, cy0 = (W - cw) // 2 - pad, 150
    draw.rounded_rectangle([cx0, cy0, cx0 + cw + pad * 2, cy0 + 52], radius=8, fill=CREAM_DARK)
    draw.text(((W - cw) // 2, cy0 + 10), chip_text, font=chip_f, fill=TEXT_SUB)

    title_f = font(GEORGIA_BOLD, 88)
    tw = text_w(draw, "TRIVIA", title_f)
    draw.text(((W - tw) // 2, 206), "TRIVIA", font=title_f, fill=NAVY)


def draw_footer(draw, line1="threatleveltrivia.com", line2=None):
    f1 = font(GEORGIA_BOLD, 38)
    w1 = text_w(draw, line1, f1)
    y = H - 130 if line2 else H - 110
    draw.text(((W - w1) // 2, y), line1, font=f1, fill=NAVY)
    if line2:
        f2 = font(GEORGIA_ITALIC, 28)
        w2 = text_w(draw, line2, f2)
        draw.text(((W - w2) // 2, y + 52), line2, font=f2, fill=GRAY)


def base_card():
    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)
    draw_grid(draw)
    draw_frame(draw)
    draw_header(img, draw)
    return img, draw


def draw_meta(draw, q, y):
    meta_f = font(GEORGIA, 30)
    meta = f"{q['category'].upper()}   •   {q['difficulty'].upper()}"
    mw = text_w(draw, meta, meta_f)
    draw.text(((W - mw) // 2, y), meta, font=meta_f, fill=GRAY_LIGHT)


def draw_question(draw, q, y_start):
    for size in (46, 40, 36, 32):
        qf = font(GEORGIA_BOLD, size)
        lines = wrap_to_width(draw, q["question"], qf, W - 200)
        if len(lines) <= 3 or size == 36:
            break
    y = y_start
    for line in lines:
        lw = text_w(draw, line, qf)
        draw.text(((W - lw) // 2, y), line, font=qf, fill=TEXT)
        y += int(qf.size * 1.32)
    return y


def draw_options(draw, options, y, bottom_limit, answer=None):
    """Four A-D pills sized to fit between y and bottom_limit. Long options
    wrap to multiple lines and each pill grows to fit its own text, so a
    single very long answer never gets clipped. If answer is given,
    highlight it and dim the rest."""
    gap = 16
    pill_w = W - 240
    x0 = (W - pill_w) // 2
    text_x = 100
    # Reserve room on the right for the checkmark on the answer card.
    right_pad = 78 if answer is not None else 44
    avail = pill_w - text_x - right_pad
    band = bottom_limit - y

    # Pick the largest uniform font at which all four pills (with wrapping)
    # stack inside the available vertical band. Wrapping is capped at 3 lines.
    chosen_size, line_h, layout = 22, 27, None
    for size in range(36, 21, -2):
        f = font(GEORGIA, size)
        lh = int(size * 1.22)
        lay = []
        for opt in options:
            lines = wrap_to_width(draw, opt, f, avail)[:3]
            pill_h = max(56, lh * len(lines) + 26)
            lay.append((lines, pill_h))
        total = sum(p[1] for p in lay) + gap * (len(options) - 1)
        if total <= band:
            chosen_size, line_h, layout = size, lh, lay
            break
    if layout is None:
        # Smallest attempt still overflowed (extremely rare); use it anyway.
        f = font(GEORGIA, 22)
        line_h = int(22 * 1.22)
        layout = [(wrap_to_width(draw, opt, f, avail)[:3],
                   max(56, line_h * len(wrap_to_width(draw, opt, f, avail)[:3]) + 26))
                  for opt in options]
        chosen_size = 22

    opt_f = font(GEORGIA, chosen_size)
    lf = font(GEORGIA_BOLD, chosen_size)
    letters = "ABCD"
    py = y
    for i, opt in enumerate(options):
        lines, pill_h = layout[i]
        is_answer = answer is not None and opt == answer
        if is_answer:
            fill, ring, tcol, lcol = CORRECT_BG, CORRECT, CORRECT, CORRECT
            ring_w = 4
        elif answer is not None:
            fill, ring, tcol, lcol = CREAM, "#d8d1c3", GRAY_LIGHT, GRAY_LIGHT
            ring_w = 2
        else:
            fill, ring, tcol, lcol = WHITE, GRAY_BORDER, TEXT, NAVY
            ring_w = 2
        draw.rounded_rectangle([x0, py, x0 + pill_w, py + pill_h], radius=14,
                               fill=fill, outline=ring, width=ring_w)
        draw.text((x0 + 34, py + (pill_h - chosen_size) // 2 - 4),
                  f"{letters[i]}.", font=lf, fill=lcol)
        block_h = line_h * len(lines)
        ty = py + (pill_h - block_h) // 2 - 2
        for line in lines:
            draw.text((x0 + text_x, ty), line, font=opt_f, fill=tcol)
            ty += line_h
        if is_answer:
            cx, cy = x0 + pill_w - 50, py + pill_h // 2
            draw.line([(cx - 12, cy + 2), (cx - 2, cy + 14)], fill=CORRECT, width=6)
            draw.line([(cx - 2, cy + 14), (cx + 18, cy - 14)], fill=CORRECT, width=6)
        py += pill_h + gap
    return py - gap


def shuffled_options(q, seed):
    opts = [q["answer"]] + q["distractors"][:3]
    rng = random.Random(seed)
    rng.shuffle(opts)
    return opts


def make_question_card(q, opts):
    img, draw = base_card()
    draw_meta(draw, q, 330)
    y = draw_question(draw, q, 392)
    end_y = draw_options(draw, opts, max(y + 36, 590), bottom_limit=H - 196)
    hint_f = font(GEORGIA_ITALIC, 32)
    hint = "Answer on the next slide"
    hw = text_w(draw, hint, hint_f)
    hx = (W - hw - 50) // 2
    hy = min(end_y + 26, H - 184)
    draw.text((hx, hy), hint, font=hint_f, fill=GRAY)
    ax, ay = hx + hw + 18, hy + 22
    draw.line([(ax, ay), (ax + 34, ay)], fill=GRAY, width=4)
    draw.line([(ax + 22, ay - 10), (ax + 34, ay)], fill=GRAY, width=4)
    draw.line([(ax + 22, ay + 10), (ax + 34, ay)], fill=GRAY, width=4)
    draw_footer(draw)
    return img


def make_answer_card(q, opts):
    img, draw = base_card()
    draw_meta(draw, q, 330)
    y = draw_question(draw, q, 392)
    draw_options(draw, opts, max(y + 36, 590), bottom_limit=H - 206, answer=q["answer"])
    draw_footer(draw, "threatleveltrivia.com",
                "Solo, Daily, and Party modes • free, no signup")
    return img


def slugify(s, max_len=40):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:max_len].rstrip("-")


CAPTION_TEMPLATE = """\
{hook}

Drop your answer below before you swipe 👇

Think you can beat the leaderboard? Play the full game free at threatleveltrivia.com (link in bio). No signup, new Daily Challenge every day.

#TheOffice #DunderMifflin #TheOfficeUS #OfficeTrivia #TriviaTime #MichaelScott #DwightSchrute #Scranton #TheOfficeFans #TriviaNight
"""

HOOKS = {
    "Easy": "Even Kevin could get this one... right?",
    "Medium": "Question of the day from the annals of Dunder Mifflin history.",
    "Hard": "Only true Dunder Mifflin employees will get this one.",
}


def export(q):
    folder = OUT_DIR / f"q{q['id']:03d}-{slugify(q['question'])}"
    folder.mkdir(parents=True, exist_ok=True)
    opts = shuffled_options(q, seed=q["id"])
    make_question_card(q, opts).save(folder / "1-question.png")
    make_answer_card(q, opts).save(folder / "2-answer.png")
    hook = HOOKS.get(q["difficulty"], HOOKS["Medium"])
    (folder / "caption.txt").write_text(
        CAPTION_TEMPLATE.format(hook=hook), encoding="utf-8"
    )
    return folder


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int, help="specific question id")
    ap.add_argument("--random", action="store_true")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--difficulty", choices=["Easy", "Medium", "Hard"])
    ap.add_argument("--category")
    args = ap.parse_args()

    qs = load_questions()
    print(f"Loaded {len(qs)} questions from data.js")

    picked = []
    if args.id:
        picked = [q for q in qs if q["id"] == args.id]
        if not picked:
            raise SystemExit(f"No question with id {args.id}")
    else:
        pool = qs
        if args.difficulty:
            pool = [q for q in pool if q["difficulty"] == args.difficulty]
        if args.category:
            pool = [q for q in pool if q["category"].lower() == args.category.lower()]
        picked = random.sample(pool, min(args.count, len(pool)))

    for q in picked:
        folder = export(q)
        print(f"  -> {folder.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
