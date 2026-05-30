"""
Generates og-image.png (1200x630) for social share previews.

On-brand: cream paper background with the faint drop-ceiling grid, the
paper-airplane logo, and the same hierarchy as the home screen
(THREAT LEVEL badge -> TRIVIA title -> tagline). Rendered at 2x and
downscaled with LANCZOS so the text stays crisp.

Run from the project root:  python tools/make_og_image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Brand palette (from css/styles.css :root) ──────────────────────
CREAM       = (242, 237, 228)
CREAM_DARK  = (229, 221, 208)
NAVY        = (28, 58, 94)
GRAY        = (107, 107, 107)
GRAY_BORDER = (197, 189, 176)
GRID_LINE   = (233, 227, 218)   # (150,140,125) @ 10% over cream

# ── Output geometry ────────────────────────────────────────────────
W, H = 1200, 630
S = 2                            # supersample factor
CW, CH = W * S, H * S

FONTS = "C:/Windows/Fonts"
def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size * S)

f_title   = font("georgiab.ttf", 150)   # TRIVIA
f_badge   = font("arialbd.ttf", 24)      # THREAT LEVEL
f_tagline = font("georgiai.ttf", 34)     # tagline (italic)
f_url     = font("georgiab.ttf", 28)     # footer url

img  = Image.new("RGB", (CW, CH), CREAM)
draw = ImageDraw.Draw(img)

# ── Faint drop-ceiling grid (64px tiles, like the site body) ───────
tile = 64 * S
for x in range(0, CW, tile):
    draw.line([(x, 0), (x, CH)], fill=GRID_LINE, width=S)
for y in range(0, CH, tile):
    draw.line([(0, y), (CW, y)], fill=GRID_LINE, width=S)

# ── Thin inset "paper" border frame ────────────────────────────────
inset = 22 * S
draw.rectangle([inset, inset, CW - inset, CH - inset],
               outline=GRAY_BORDER, width=2 * S)

# ── Helpers ────────────────────────────────────────────────────────
def text_w(s, fnt, tracking=0):
    w = draw.textlength(s, font=fnt)
    return w + tracking * max(len(s) - 1, 0)

def draw_tracked(cx, y, s, fnt, fill, tracking):
    """Draw horizontally-centered text with manual letter spacing."""
    total = text_w(s, fnt, tracking)
    x = cx - total / 2
    for ch in s:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking

cx = CW // 2

# ── Logo (paper airplane, transparent PNG) ─────────────────────────
logo = Image.open(os.path.join(ROOT, "favicon.PNG")).convert("RGBA")
LOGO = 168 * S
logo = logo.resize((LOGO, LOGO), Image.LANCZOS)
img.paste(logo, (cx - LOGO // 2, 60 * S), logo)

# ── THREAT LEVEL badge (cream-dark pill, bordered) ─────────────────
badge_txt = "THREAT LEVEL"
btrack = 8 * S
bw = text_w(badge_txt, f_badge, btrack)
pad_x, pad_y = 18 * S, 9 * S
by = 250 * S
bx0, bx1 = cx - bw / 2 - pad_x, cx + bw / 2 + pad_x
bh = (f_badge.getbbox(badge_txt)[3]) + pad_y * 2
draw.rounded_rectangle([bx0, by, bx1, by + bh], radius=4 * S,
                       fill=CREAM_DARK, outline=GRAY_BORDER, width=2)
draw_tracked(cx, by + pad_y - 2 * S, badge_txt, f_badge, GRAY, btrack)

# ── TRIVIA title (serif, navy, uppercase, tracked) ─────────────────
draw_tracked(cx, 300 * S, "TRIVIA", f_title, NAVY, 6 * S)

# ── Tagline (serif italic, gray) ───────────────────────────────────
tagline = "Scranton's Finest Test of Office Knowledge"
draw.text((cx - text_w(tagline, f_tagline) / 2, 470 * S), tagline,
          font=f_tagline, fill=GRAY)

# ── Footer URL ─────────────────────────────────────────────────────
url = "threatleveltrivia.com"
draw.text((cx - text_w(url, f_url) / 2, 545 * S), url, font=f_url, fill=NAVY)

# ── Downscale + save ───────────────────────────────────────────────
out = img.resize((W, H), Image.LANCZOS)
out.save(os.path.join(ROOT, "og-image.png"), "PNG", optimize=True)
print("Wrote og-image.png", out.size)
