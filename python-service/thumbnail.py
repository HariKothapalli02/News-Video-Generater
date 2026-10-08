import os
import re
import io
import math
import subprocess
import requests
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

THUMB_WIDTH = 1280
THUMB_HEIGHT = 720


def get_best_font(size, bold=True):
    """
    Attempts to load a strong, clean sans-serif bold font across Windows, Linux, and Mac.
    Falls back gracefully to Pillow default font.
    """
    candidate_fonts = []
    if bold:
        candidate_fonts.extend([
            "arialbd.ttf", "impact.ttf", "segoeuib.ttf", "calibrib.ttf",
            "trebucbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf",
            "HelveticaNeue-Bold.ttf", "Arial-Bold.ttf"
        ])
    candidate_fonts.extend([
        "arial.ttf", "segoeui.ttf", "calibri.ttf",
        "DejaVuSans.ttf", "LiberationSans-Regular.ttf"
    ])

    for font_name in candidate_fonts:
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            continue

    # Fallback to default font
    return ImageFont.load_default()


def fetch_pexels_photo(query):
    """
    Searches Pexels Photo API for high-resolution landscape images matching the query.
    Returns a PIL Image object or None.
    """
    if not PEXELS_API_KEY:
        print("[Thumbnail] PEXELS_API_KEY not configured. Skipping Pexels photo search.")
        return None

    url = "https://api.pexels.com/v1/search"
    headers = {"Authorization": PEXELS_API_KEY}
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

        # Pick the photo with highest resolution
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


def extract_video_frame(video_path, timestamp_sec=4.0):
    """
    Extracts a crisp frame from the rendered video as fallback.
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
    Creates a modern dark gradient backdrop if no photo is available.
    """
    img = Image.new("RGB", (THUMB_WIDTH, THUMB_HEIGHT), color=(15, 23, 42))
    draw = ImageDraw.Draw(img)
    # Draw subtle background glow
    for y in range(THUMB_HEIGHT):
        ratio = y / THUMB_HEIGHT
        r = int(15 + ratio * 20)
        g = int(23 + ratio * 15)
        b = int(42 + ratio * 35)
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
    subject="news",
    video_path=None,
    intro_offset=0.0
):
    """
    Generates a professional, high-CTR YouTube News Thumbnail:
    1. Downloads high-res photo from Pexels based on the #1 breaking news story.
    2. Resizes & crops to 1280x720 with cinematic color enhancement.
    3. Adds high-contrast left & bottom dark gradient overlay for text readability.
    4. Renders '🔴 BREAKING NEWS' badge, punchy high-contrast hook headline,
       accent highlight word, and 'BYTEWIRE NEWS' brand pill.
    5. Saves directly to output_path.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    facts = facts or []

    # 1. Determine image search query from top breaking story
    primary_query = ""
    if facts and len(facts) > 0:
        f0 = facts[0]
        # Clean title of symbols and use top keywords
        t_clean = re.sub(r"[^a-zA-Z0-9\s]", " ", f0.get("title", "")).strip()
        words = [w for w in t_clean.split() if len(w) > 3 and w.lower() not in ["news", "today", "breaking", "with", "that", "this", "from"]]
        primary_query = " ".join(words[:4])
    elif title:
        t_clean = re.sub(r"[^a-zA-Z0-9\s]", " ", title).strip()
        words = [w for w in t_clean.split() if len(w) > 3 and w.lower() not in ["news", "today", "breaking", "with", "that", "this", "from"]]
        primary_query = " ".join(words[:4])

    if not primary_query:
        primary_query = f"{subject} technology breaking news"

    # 2. Gather image (Pexels -> video frame -> solid backdrop)
    found_img = None
    if primary_query:
        found_img = fetch_pexels_photo(primary_query)

    # Fallback to general subject query if specific story query yielded nothing
    if not found_img and subject:
        found_img = fetch_pexels_photo(f"{subject} breaking news")

    if not found_img and video_path:
        print("[Thumbnail] Falling back to extracting high-res frame from video...")
        found_img = extract_video_frame(video_path, timestamp_sec=max(1.0, intro_offset + 4.0))

    base_raw = found_img if found_img is not None else create_solid_fallback(subject)

    # 3. Fit to 1280x720 with high-quality resampling
    resample_filter = getattr(Image, "LANCZOS", 1)
    base_image = ImageOps.fit(base_raw, (THUMB_WIDTH, THUMB_HEIGHT), method=resample_filter)

    # 4. Cinematic enhancements (boost contrast & color vibrancy)
    enhancer_contrast = ImageEnhance.Contrast(base_image)
    base_image = enhancer_contrast.enhance(1.15)
    enhancer_color = ImageEnhance.Color(base_image)
    base_image = enhancer_color.enhance(1.20)

    # 5. Apply Left & Bottom Dark Gradient Overlay for text contrast
    overlay = Image.new("RGBA", (THUMB_WIDTH, THUMB_HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    # Multi-stop horizontal gradient from left (darker) to right (clear)
    for x in range(int(THUMB_WIDTH * 0.75)):
        ratio = x / (THUMB_WIDTH * 0.75)
        # Cosine ease out for natural vignette
        alpha = int(220 * (1.0 - math.sin(ratio * math.pi / 2)))
        overlay_draw.line([(x, 0), (x, THUMB_HEIGHT)], fill=(10, 15, 28, alpha))

    # Bottom gradient overlay for subtext and branding
    for y in range(int(THUMB_HEIGHT * 0.65), THUMB_HEIGHT):
        ratio = (y - THUMB_HEIGHT * 0.65) / (THUMB_HEIGHT * 0.35)
        alpha = int(180 * ratio)
        overlay_draw.line([(0, y), (THUMB_WIDTH, y)], fill=(5, 8, 18, alpha))

    base_image = Image.alpha_composite(base_image.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(base_image)

    # 6. Top Left Pill Badge: "🔴 BREAKING NEWS"
    badge_x = 60
    badge_y = 60
    badge_font = get_best_font(26, bold=True)
    badge_text = "🔴 BREAKING NEWS"
    try:
        b_box = badge_font.getbbox(badge_text)
        b_w, b_h = b_box[2] - b_box[0], b_box[3] - b_box[1]
    except Exception:
        b_w, b_h = 240, 30

    pad_x, pad_y = 20, 10
    draw_rounded_pill(
        draw,
        (badge_x, badge_y, badge_x + b_w + pad_x * 2, badge_y + b_h + pad_y * 2 + 4),
        fill_color=(220, 38, 38, 240),  # Vibrant red
        border_color=(254, 202, 202, 180),
        border_width=2,
        radius=14
    )
    draw.text((badge_x + pad_x, badge_y + pad_y), badge_text, fill=(255, 255, 255, 255), font=badge_font)

    # 7. Top Right Brand Pill: "BYTEWIRE NEWS"
    brand_text = "BYTEWIRE NEWS"
    brand_font = get_best_font(22, bold=True)
    try:
        br_box = brand_font.getbbox(brand_text)
        br_w, br_h = br_box[2] - br_box[0], br_box[3] - br_box[1]
    except Exception:
        br_w, br_h = 160, 24

    br_x = THUMB_WIDTH - 60 - br_w - pad_x * 2
    draw_rounded_pill(
        draw,
        (br_x, badge_y, br_x + br_w + pad_x * 2, badge_y + br_h + pad_y * 2 + 4),
        fill_color=(15, 23, 42, 210),  # Dark navy glass
        border_color=(51, 65, 85, 200),
        border_width=1,
        radius=12
    )
    draw.text((br_x + pad_x, badge_y + pad_y), brand_text, fill=(241, 245, 249, 255), font=brand_font)

    # 8. Main Catchy Hook Headline (Big, Bold, 2-3 Lines)
    # Formulate punchy headline words
    lines = []
    if hook_text and len(hook_text.strip()) > 3:
        clean_hook = hook_text.upper().replace("*", "").strip()
        lines = [clean_hook]
    elif facts and len(facts) > 0:
        top_title = facts[0].get("title", "").replace("*", "").strip()
        # Clean title into 4-6 strong words
        w_list = [w.upper() for w in re.sub(r"[^a-zA-Z0-9\s]", "", top_title).split() if len(w) > 2]
        if len(w_list) >= 4:
            lines = [" ".join(w_list[:3]), " ".join(w_list[3:6])]
        elif len(w_list) > 0:
            lines = [" ".join(w_list), "SHOCKING UPDATE!"]
        else:
            lines = ["IT FINALLY HAPPENED!", "TOP 10 STORIES"]
    else:
        lines = ["BREAKING REPORT:", f"TOP 10 {subject.upper()} NEWS"]

    # Limit to max 3 lines
    lines = lines[:3]

    # Render Main Headline with Stroke & Drop Shadow
    head_font_size = 68 if len(lines) <= 2 else 56
    head_font = get_best_font(head_font_size, bold=True)

    text_start_y = 170
    line_spacing = head_font_size + 14

    for idx, line_text in enumerate(lines):
        curr_y = text_start_y + (idx * line_spacing)
        curr_x = 60

        # Alternate color: make the 2nd line bright yellow for maximum CTR
        text_color = (250, 204, 21, 255) if idx == 1 else (255, 255, 255, 255)

        # Deep drop shadow
        draw.text((curr_x + 4, curr_y + 4), line_text, fill=(0, 0, 0, 240), font=head_font)
        # Outline / stroke
        for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2)]:
            draw.text((curr_x + dx, curr_y + dy), line_text, fill=(0, 0, 0, 200), font=head_font)
        # Main text
        draw.text((curr_x, curr_y), line_text, fill=text_color, font=head_font)

    # 9. Sub-headline badge (e.g. "TOP 10 VERIFIED STORIES TODAY")
    sub_y = text_start_y + (len(lines) * line_spacing) + 20
    sub_font = get_best_font(28, bold=True)
    sub_text = f"TOP 10 {subject.upper()} STORIES • TODAY"
    try:
        s_box = sub_font.getbbox(sub_text)
        s_w, s_h = s_box[2] - s_box[0], s_box[3] - s_box[1]
    except Exception:
        s_w, s_h = 320, 30

    draw_rounded_pill(
        draw,
        (60, sub_y, 60 + s_w + 30, sub_y + s_h + 20),
        fill_color=(30, 41, 59, 230),
        border_color=(234, 179, 8, 220),  # Yellow amber accent
        border_width=2,
        radius=10
    )
    draw.text((75, sub_y + 8), sub_text, fill=(254, 240, 138, 255), font=sub_font)

    # 10. Bottom Accent Bar (6px Red bar)
    draw.rectangle([(0, THUMB_HEIGHT - 8), (THUMB_WIDTH, THUMB_HEIGHT)], fill=(220, 38, 38, 255))

    # Convert to RGB and save
    final_img = base_image.convert("RGB")
    final_img.save(output_path, "PNG")
    print(f"[Thumbnail] Professional high-CTR YouTube thumbnail created: {output_path}")
    return output_path
