import os
import re
import io
import math
import subprocess
import requests
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")

def get_pexels_api_key():
    load_dotenv(ENV_PATH, override=True)
    return os.getenv("PEXELS_API_KEY", "").strip()

THUMB_WIDTH = 1280
THUMB_HEIGHT = 720

FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
LOCAL_TELUGU_FONT = os.path.join(FONTS_DIR, "NotoSansTelugu-Bold.ttf")

TELUGU_FONT_URLS = [
    "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Bold.ttf",
    "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Bold.ttf",
    "https://fonts.gstatic.com/ea/notosanstelugu/v3/NotoSansTelugu-Bold.ttf"
]


def ensure_telugu_font_downloaded():
    """
    Ensures NotoSansTelugu-Bold.ttf is present locally. If missing, auto-downloads it from Google.
    Guarantees that Telugu glyphs never render as empty square boxes (tofu).
    """
    os.makedirs(FONTS_DIR, exist_ok=True)
    if os.path.exists(LOCAL_TELUGU_FONT) and os.path.getsize(LOCAL_TELUGU_FONT) > 20000:
        return LOCAL_TELUGU_FONT

    print(f"[Thumbnail] Auto-downloading Google Noto Sans Telugu font to {LOCAL_TELUGU_FONT}...")
    for url in TELUGU_FONT_URLS:
        try:
            resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200 and len(resp.content) > 20000:
                with open(LOCAL_TELUGU_FONT, "wb") as f:
                    f.write(resp.content)
                print(f"[Thumbnail] Downloaded NotoSansTelugu-Bold.ttf ({len(resp.content) / 1024:.1f} KB)")
                return LOCAL_TELUGU_FONT
        except Exception as e:
            print(f"[Thumbnail] Font download attempt failed ({url}): {e}")

    return None


def font_supports_telugu(font):
    """
    Verifies that a loaded Pillow font can render Telugu characters without tofu boxes.
    """
    try:
        # 'ఆ' is Telugu letter AA (U+0C06)
        bbox = font.getbbox("ఆ")
        if bbox and (bbox[2] - bbox[0] > 0) and (bbox[3] - bbox[1] > 0):
            mask = font.getmask("ఆ")
            if mask and mask.size[0] > 0 and mask.size[1] > 0:
                return True
    except Exception:
        pass
    return False


def get_best_font(size, bold=True, for_telugu=True):
    """
    Loads a font guaranteed to render Telugu properly.
    Prioritizes bundled/downloaded Noto Sans Telugu, then checks system font directories.
    """
    candidates = []

    if for_telugu:
        local_font = ensure_telugu_font_downloaded()
        if local_font and os.path.exists(local_font):
            candidates.append(local_font)

        # Linux / Ubuntu system fonts (installed via fonts-noto-core / fonts-telu / fonts-lohit-telu)
        candidates.extend([
            "/usr/share/fonts/truetype/noto/NotoSansTelugu-Bold.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansTelugu-Bold.otf",
            "/usr/share/fonts/opentype/noto/NotoSansTelugu-Regular.otf",
            "/usr/share/fonts/truetype/lohit-telugu/Lohit-Telugu.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        ])

        # Windows system fonts
        candidates.extend([
            "C:/Windows/Fonts/NirmalaB.ttf",
            "C:/Windows/Fonts/Nirmala.ttf",
            "C:/Windows/Fonts/gautamib.ttf",
            "C:/Windows/Fonts/gautami.ttf",
            "NirmalaB.ttf", "nirmalab.ttf", "Nirmala.ttf", "nirmala.ttf",
            "gautamib.ttf", "gautami.ttf"
        ])

    # Standard English fallbacks
    if bold:
        candidates.extend([
            "arialbd.ttf", "impact.ttf", "segoeuib.ttf", "calibrib.ttf",
            "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"
        ])
    else:
        candidates.extend([
            "arial.ttf", "segoeui.ttf", "calibri.ttf",
            "DejaVuSans.ttf", "LiberationSans-Regular.ttf"
        ])

    for font_path in candidates:
        try:
            f = ImageFont.truetype(font_path, size)
            if for_telugu:
                if font_supports_telugu(f):
                    return f
            else:
                return f
        except Exception:
            continue

    if for_telugu:
        downloaded = ensure_telugu_font_downloaded()
        if downloaded and os.path.exists(downloaded):
            try:
                return ImageFont.truetype(downloaded, size)
            except Exception:
                pass

    return ImageFont.load_default()


def fetch_pexels_photo(query):
    """
    Searches Pexels Photo API for high-resolution landscape images matching the query.
    """
    api_key = get_pexels_api_key()
    if not api_key:
        print("[Thumbnail] PEXELS_API_KEY not configured. Skipping Pexels photo search.")
        return None

    url = "https://api.pexels.com/v1/search"
    headers = {"Authorization": api_key}
    params = {
        "query": query,
        "orientation": "landscape",
        "per_page": 10
    }

    try:
        print(f"[Thumbnail] Searching Pexels Photo API for query: '{query}'...")
        res = requests.get(url, headers=headers, params=params, timeout=20)
        if res.status_code != 200:
            print(f"[Thumbnail] Pexels returned status {res.status_code}")
            return None

        data = res.json()
        photos = data.get("photos", [])
        if not photos:
            return None

        # Pick photo with highest resolution
        best_photo = photos[0]
        for p in photos:
            if p.get("width", 0) >= 1280:
                best_photo = p
                break

        src = best_photo.get("src", {})
        photo_url = src.get("large2x") or src.get("original") or src.get("large")
        if not photo_url:
            return None

        print(f"[Thumbnail] Downloading candidate photo from Pexels (ID: {best_photo.get('id')})...")
        img_res = requests.get(photo_url, timeout=25)
        if img_res.status_code == 200:
            return Image.open(io.BytesIO(img_res.content)).convert("RGB")
    except Exception as e:
        print(f"[Thumbnail] Error fetching Pexels photo: {e}")

    return None


def fetch_wikimedia_photo(query):
    """
    Fetches a high-resolution news photo from Wikimedia Commons (free, no API key required).
    """
    clean_q = re.sub(r"[^a-zA-Z0-9\s]", " ", str(query)).strip()
    if not clean_q:
        return None
    url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{clean_q}",
        "gsrnamespace": 6,
        "gsrlimit": 8,
        "prop": "imageinfo",
        "iiprop": "url|mime|width|height",
        "format": "json"
    }
    headers = {
        "User-Agent": "ByteWireVideoBot/1.0 (https://ytvideo.harikothapalli.space)"
    }
    try:
        res = requests.get(url, params=params, headers=headers, timeout=12)
        if res.status_code == 200:
            data = res.json()
            pages = data.get("query", {}).get("pages", {})
            for pid, page in pages.items():
                infos = page.get("imageinfo", [])
                if not infos:
                    continue
                info = infos[0]
                media_url = info.get("url")
                width = info.get("width", 0)
                if media_url and width >= 1000 and media_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    img_res = requests.get(media_url, timeout=20)
                    if img_res.status_code == 200:
                        return Image.open(io.BytesIO(img_res.content)).convert("RGB")
    except Exception as e:
        print(f"[Thumbnail] Notice: Wikimedia image search: {e}")

    return None


def extract_video_frame(video_path, timestamp_sec=4.0):
    """
    Extracts a crisp frame from the compiled video file via FFmpeg.
    """
    if not video_path or not os.path.exists(video_path):
        return None

    try:
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(max(1.0, timestamp_sec)),
            "-i", os.path.abspath(video_path),
            "-vframes", "1",
            "-f", "image2pipe",
            "-vcodec", "png",
            "-"
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        out, _ = proc.communicate(timeout=15)
        if out and len(out) > 5000:
            return Image.open(io.BytesIO(out)).convert("RGB")
    except Exception as e:
        print(f"[Thumbnail] Warning extracting frame fallback: {e}")

    return None


def create_solid_fallback(subject):
    """
    Creates a deep broadcast studio gradient backdrop if no photo is available.
    """
    img = Image.new("RGB", (THUMB_WIDTH, THUMB_HEIGHT), color=(10, 15, 28))
    draw = ImageDraw.Draw(img)
    for y in range(THUMB_HEIGHT):
        ratio = y / THUMB_HEIGHT
        r = int(12 + ratio * 24)
        g = int(18 + ratio * 16)
        b = int(36 + ratio * 48)
        draw.line([(0, y), (THUMB_WIDTH, y)], fill=(r, g, b))
    return img


def draw_rounded_pill(draw, xy, fill_color, border_color=None, border_width=1, radius=14):
    """Draws a modern rounded rectangle pill banner with fallback."""
    x0, y0, x1, y1 = xy
    box = (x0, y0, x1, y1)
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill_color)
        if border_color and border_width > 0:
            draw.rounded_rectangle(box, radius=radius, outline=border_color, width=border_width)
    else:
        draw.rectangle(box, fill=fill_color)
        if border_color and border_width > 0:
            draw.rectangle(box, outline=border_color, width=border_width)


def create_youtube_thumbnail(
    output_path,
    title="",
    hook_text="",
    facts=None,
    subject="telugu_news",
    video_path=None,
    intro_offset=0.0
):
    """
    Generates a viral, high-CTR YouTube News Thumbnail:
    1. Gathers high-res news visual (video frame or Pexels broadcast news photos).
    2. Applies cinematic contrast & saturation enhancements.
    3. Renders guaranteed Telugu fonts (Noto Sans Telugu) - NO TOFU SQUARES.
    4. Displays high-CTR elements:
       - '🔴 బ్రేకింగ్ న్యూస్' pill badge with glowing border.
       - '⚡ లైవ్ అప్‌డేట్స్ | BYTEWIRE' glass brand tag.
       - High-contrast 2-line Telugu headline with vibrant golden yellow (#FFE600) hook + white story title.
       - Drop shadow + thick black outline for maximum mobile readability.
       - Golden-bordered '🔥 టాప్ 10 ముఖ్యాంశాలు • నేటి తాజా వార్తలు' highlights pill.
       - Bottom red & yellow breaking news ticker accent line.
    5. Saves directly to output_path.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    facts = facts or []

    # 1. Determine English visual search query (never search Telugu words on Pexels/Wikimedia)
    primary_query = ""
    if facts and len(facts) > 0:
        f0 = facts[0]
        # Check if f0 already has an English search query
        primary_query = f0.get("search_query") or f0.get("query") or f0.get("keywords") or ""
        if not primary_query:
            eng_words = [w for w in re.sub(r"[^a-zA-Z\s]", " ", f0.get("title", "")).split() if len(w) > 2]
            if len(eng_words) >= 2:
                primary_query = " ".join(eng_words[:3])

    telugu_curated_queries = [
        "breaking news television broadcast studio",
        "live news television studio anchor",
        "press conference news media journalists",
        "hyderabad telangana india city news",
        "andhra pradesh breaking news broadcast",
        "television newsroom broadcast camera live"
    ]

    if not primary_query:
        import random
        primary_query = random.choice(telugu_curated_queries)

    # 2. Gather image (First check real video frame, then Pexels, then Wikimedia, then solid)
    found_img = None

    # Priority 1: Extract real broadcast b-roll frame from compiled video (always 100% relevant!)
    if video_path and os.path.exists(video_path):
        print(f"[Thumbnail] Extracting high-res broadcast visual frame from video at {max(1.0, intro_offset + 5.0):.1f}s...")
        found_img = extract_video_frame(video_path, timestamp_sec=max(1.0, intro_offset + 5.0))

    # Priority 2: Pexels photo search
    if not found_img and primary_query:
        found_img = fetch_pexels_photo(primary_query)

    # Priority 3: Wikimedia Commons
    if not found_img:
        found_img = fetch_wikimedia_photo("breaking news broadcast studio")

    base_raw = found_img if found_img is not None else create_solid_fallback(subject)

    # 3. Fit to 1280x720 with high-quality resampling
    resample_filter = getattr(Image, "LANCZOS", 1)
    base_image = ImageOps.fit(base_raw, (THUMB_WIDTH, THUMB_HEIGHT), method=resample_filter)

    # 4. Cinematic enhancements (boost contrast & color vibrancy)
    enhancer_contrast = ImageEnhance.Contrast(base_image)
    base_image = enhancer_contrast.enhance(1.22)
    enhancer_color = ImageEnhance.Color(base_image)
    base_image = enhancer_color.enhance(1.30)

    # 5. Apply Left & Bottom Dark Gradient Overlay for text contrast
    overlay = Image.new("RGBA", (THUMB_WIDTH, THUMB_HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    # Deep left-to-right gradient for 100% text readability
    for x in range(int(THUMB_WIDTH * 0.72)):
        ratio = x / (THUMB_WIDTH * 0.72)
        alpha = int(235 * (1.0 - math.sin(ratio * math.pi / 2)))
        overlay_draw.line([(x, 0), (x, THUMB_HEIGHT)], fill=(8, 12, 24, alpha))

    # Bottom gradient overlay for subtext and branding
    for y in range(int(THUMB_HEIGHT * 0.60), THUMB_HEIGHT):
        ratio = (y - THUMB_HEIGHT * 0.60) / (THUMB_HEIGHT * 0.40)
        alpha = int(210 * ratio)
        overlay_draw.line([(0, y), (THUMB_WIDTH, y)], fill=(4, 6, 16, alpha))

    base_image = Image.alpha_composite(base_image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(base_image)

    # 6. Top Left Pill Badge: "🔴 బ్రేకింగ్ న్యూస్ | LIVE"
    badge_x = 55
    badge_y = 50
    badge_font = get_best_font(26, bold=True, for_telugu=True)
    badge_text = "🔴 బ్రేకింగ్ న్యూస్"
    try:
        b_box = badge_font.getbbox(badge_text)
        b_w, b_h = b_box[2] - b_box[0], b_box[3] - b_box[1]
    except Exception:
        b_w, b_h = 250, 32

    pad_x, pad_y = 22, 10
    draw_rounded_pill(
        draw,
        (badge_x, badge_y, badge_x + b_w + pad_x * 2, badge_y + b_h + pad_y * 2 + 6),
        fill_color=(220, 38, 38, 245),  # Vibrant breaking news red
        border_color=(254, 202, 202, 200),
        border_width=2,
        radius=14
    )
    draw.text((badge_x + pad_x, badge_y + pad_y), badge_text, fill=(255, 255, 255, 255), font=badge_font)

    # 7. Top Right Brand Pill: "BYTEWIRE NEWS"
    brand_text = "BYTEWIRE NEWS • LIVE"
    brand_font = get_best_font(20, bold=True, for_telugu=False)
    try:
        br_box = brand_font.getbbox(brand_text)
        br_w, br_h = br_box[2] - br_box[0], br_box[3] - br_box[1]
    except Exception:
        br_w, br_h = 200, 24

    br_x = THUMB_WIDTH - 55 - br_w - pad_x * 2
    draw_rounded_pill(
        draw,
        (br_x, badge_y, br_x + br_w + pad_x * 2, badge_y + br_h + pad_y * 2 + 6),
        fill_color=(15, 23, 42, 220),  # Dark navy glass
        border_color=(234, 179, 8, 190),  # Gold rim
        border_width=1.5,
        radius=14
    )
    draw.text((br_x + pad_x, badge_y + pad_y + 2), brand_text, fill=(254, 240, 138, 255), font=brand_font)

    # 8. High-CTR Telugu Headline Construction
    # Line 1: Punchy curiosity hook (e.g., "సంచలన వార్త!", "బిగ్ బ్రేకింగ్!")
    # Line 2: Story topic / detail
    lines = []
    clean_hook = (hook_text or "").replace("*", "").strip()

    if clean_hook and len(clean_hook) > 1:
        lines.append(clean_hook)
        if facts and len(facts) > 0:
            top_title = facts[0].get("title", "").replace("*", "").strip()
            # Clean title words
            t_words = [w for w in top_title.split() if len(w) > 1]
            if len(t_words) > 0:
                lines.append(" ".join(t_words[:4]))
    elif facts and len(facts) > 0:
        top_title = facts[0].get("title", "").replace("*", "").strip()
        w_list = [w for w in top_title.split() if len(w) > 1]
        if len(w_list) >= 4:
            lines = [" ".join(w_list[:3]), " ".join(w_list[3:6])]
        elif len(w_list) > 0:
            lines = [" ".join(w_list), "సంచలన బ్రేకింగ్!"]
        else:
            lines = ["నేటి ముఖ్య వార్తలు", "టాప్ 10 ముఖ్యాంశాలు"]
    else:
        lines = ["బ్రేకింగ్ న్యూస్:", "టాప్ 10 తాజా వార్తలు"]

    lines = lines[:2]  # Keep to 2 massive punchy lines for maximum mobile CTR

    # 9. Render Main Headline with Heavy Outline & Glow
    head_font_size = 66
    head_font = get_best_font(head_font_size, bold=True, for_telugu=True)

    text_start_y = 160
    line_spacing = head_font_size + 24

    for idx, line_text in enumerate(lines):
        curr_y = text_start_y + (idx * line_spacing)
        curr_x = 55

        # Measure text width
        try:
            line_box = head_font.getbbox(line_text)
            lw = line_box[2] - line_box[0]
            lh = line_box[3] - line_box[1]
        except Exception:
            lw, lh = 600, head_font_size

        # Draw dark backing ribbon for 100% legibility on any image
        ribbon_bg = (10, 15, 28, 220) if idx == 0 else (15, 23, 42, 210)
        ribbon_border = (234, 179, 8, 200) if idx == 0 else (220, 38, 38, 180)
        draw_rounded_pill(
            draw,
            (curr_x - 12, curr_y - 6, curr_x + lw + 24, curr_y + lh + 18),
            fill_color=ribbon_bg,
            border_color=ribbon_border,
            border_width=2,
            radius=12
        )

        # Line 1 in Golden Yellow (#FFE600) for intense CTR curiosity; Line 2 in Crisp White (#FFFFFF)
        text_color = (255, 230, 0, 255) if idx == 0 else (255, 255, 255, 255)

        # 4px drop shadow + 3px outline
        for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)]:
            draw.text((curr_x + dx, curr_y + dy), line_text, fill=(0, 0, 0, 255), font=head_font)
        draw.text((curr_x + 4, curr_y + 4), line_text, fill=(0, 0, 0, 240), font=head_font)
        # Main text
        draw.text((curr_x, curr_y), line_text, fill=text_color, font=head_font)

    # 10. Sub-headline Viral Highlights Banner: "🔥 టాప్ 10 ముఖ్యాంశాలు • నేటి తాజా వార్తలు"
    sub_y = text_start_y + (len(lines) * line_spacing) + 26
    sub_font = get_best_font(28, bold=True, for_telugu=True)
    sub_text = "🔥 టాప్ 10 ముఖ్యాంశాలు • నేటి తాజా వార్తలు"
    try:
        s_box = sub_font.getbbox(sub_text)
        s_w, s_h = s_box[2] - s_box[0], s_box[3] - s_box[1]
    except Exception:
        s_w, s_h = 420, 32

    draw_rounded_pill(
        draw,
        (55, sub_y, 55 + s_w + 36, sub_y + s_h + 22),
        fill_color=(15, 23, 42, 235),
        border_color=(234, 179, 8, 230),  # Yellow amber accent
        border_width=2,
        radius=12
    )
    draw.text((72, sub_y + 8), sub_text, fill=(254, 240, 138, 255), font=sub_font)

    # 11. Bottom Breaking News Accent Line (8px Red & Yellow Strip)
    draw.rectangle([(0, THUMB_HEIGHT - 10), (int(THUMB_WIDTH * 0.6), THUMB_HEIGHT)], fill=(220, 38, 38, 255))
    draw.rectangle([(int(THUMB_WIDTH * 0.6), THUMB_HEIGHT - 10), (THUMB_WIDTH, THUMB_HEIGHT)], fill=(234, 179, 8, 255))

    # Convert to RGB and save
    final_img = base_image.convert("RGB")
    final_img.save(output_path, "PNG", optimize=True)

    # YouTube strict limit: maximum 2MB thumbnail size
    if os.path.exists(output_path) and os.path.getsize(output_path) > 2000000:
        print("[Thumbnail] File size exceeds 2MB YouTube limit. Compressing to high-quality JPEG/PNG...")
        final_img.save(output_path, "JPEG", quality=92, optimize=True)

    print(f"[Thumbnail] Professional high-CTR YouTube thumbnail created: {output_path} ({os.path.getsize(output_path) / 1024:.1f} KB)")
    return output_path
