import os
import sys
import requests

FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
TELUGU_BOLD_FONT = os.path.join(FONTS_DIR, "NotoSansTelugu-Bold.ttf")
TELUGU_REGULAR_FONT = os.path.join(FONTS_DIR, "NotoSansTelugu-Regular.ttf")

FONT_URLS = [
    "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Bold.ttf",
    "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Bold.ttf",
    "https://fonts.gstatic.com/ea/notosanstelugu/v3/NotoSansTelugu-Bold.ttf"
]

def ensure_telugu_font():
    os.makedirs(FONTS_DIR, exist_ok=True)
    if os.path.exists(TELUGU_BOLD_FONT) and os.path.getsize(TELUGU_BOLD_FONT) > 20000:
        return TELUGU_BOLD_FONT

    print(f"[Fonts] Noto Sans Telugu font missing. Downloading high-res Telugu font to {TELUGU_BOLD_FONT}...")
    for url in FONT_URLS:
        try:
            resp = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200 and len(resp.content) > 20000:
                with open(TELUGU_BOLD_FONT, "wb") as f:
                    f.write(resp.content)
                print(f"[Fonts] Successfully downloaded NotoSansTelugu-Bold.ttf ({len(resp.content) / 1024:.1f} KB)")
                return TELUGU_BOLD_FONT
        except Exception as e:
            print(f"[Fonts] Warning trying {url}: {e}")

    return None

if __name__ == "__main__":
    path = ensure_telugu_font()
    print("Resolved Telugu font path:", path)
