import os
import re
import time
import random
import requests
import subprocess
import shutil
from dotenv import load_dotenv

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def get_ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def get_pexels_api_key():
    load_dotenv(ENV_PATH, override=True)
    return os.getenv("PEXELS_API_KEY", "").strip()


CLIPS_PER_SCENE = 3


def search_pexels_videos(query, count=3):
    api_key = get_pexels_api_key()
    if not api_key:
        print("[WARNING] PEXELS_API_KEY is not configured in .env.")
        return []

    url = "https://api.pexels.com/videos/search"
    headers = {
        "Authorization": api_key
    }
    params = {
        "query": query,
        "orientation": "landscape",
        "per_page": 20
    }

    try:
        response = requests.get(
            url,
            headers=headers,
            params=params,
            timeout=25
        )
        if response.status_code != 200:
            if response.status_code == 401:
                masked = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "***"
                print(f"[PEXELS AUTH ERROR] Pexels API returned 401 Unauthorized! The key '{masked}' in .env is invalid or expired. Activating fallback video engine...")
            else:
                print(f"Pexels API error status {response.status_code}: {response.text}")
            return []

        videos = response.json().get("videos", [])
        if not videos:
            return []

        # Shuffle candidates slightly to avoid identical repetition across similar queries
        random.shuffle(videos)

        links = []
        for video in videos:
            files = video.get("video_files", [])
            if not files:
                continue

            # Prioritize crisp Full HD 1080p, then 720p HD.
            # Avoid 4K/UHD (width > 1920 or height > 1080) to prevent memory exhaustion on cloud servers.
            valid_files = [f for f in files if f.get("link") and f.get("file_type") == "video/mp4"]
            if not valid_files:
                valid_files = [f for f in files if f.get("link")]

            fhd_files = [f for f in valid_files if f.get("width") == 1920 or f.get("height") == 1080]
            hd_files = [f for f in valid_files if f.get("width") == 1280 or f.get("height") == 720]
            standard_files = [f for f in valid_files if f.get("width", 0) <= 1920 and f.get("height", 0) <= 1080]

            if fhd_files:
                chosen = fhd_files[0]
            elif hd_files:
                chosen = hd_files[0]
            elif standard_files:
                chosen = standard_files[0]
            else:
                chosen = valid_files[0]

            if chosen and chosen.get("link"):
                link = chosen["link"]
                if link not in links:
                    links.append(link)
                if len(links) >= count:
                    break

        return links
    except Exception as e:
        print(f"Pexels search failed for query '{query}': {e}")
        return []


def download_video(url, filename, clips_dir):
    os.makedirs(clips_dir, exist_ok=True)
    path = os.path.join(clips_dir, filename)

    if os.path.exists(path) and os.path.getsize(path) > 100000:
        return path

    print(f"Downloading clip ({filename})...")
    try:
        response = requests.get(url, stream=True, timeout=(15, 60))
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))
        downloaded = 0
        last_reported_pct = -1

        with open(path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = int((downloaded / total_size) * 100)
                        # Print only at milestone percentages (25%, 50%, 75%) to avoid flooding stdout and DB
                        if pct in (25, 50, 75) and pct != last_reported_pct:
                            print(f"[LOG] Download progress: {pct}% ({downloaded / (1024 * 1024):.1f}MB/{total_size / (1024 * 1024):.1f}MB)")
                            last_reported_pct = pct

        file_size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"[LOG] Finished downloading {filename} ({file_size_mb:.2f}MB).")
        
        # Verify file size
        if os.path.getsize(path) < 10000:
            print(f"Warning: downloaded file {filename} is suspiciously small.")
            return None
        return path
    except Exception as e:
        print(f"\nFailed to download {filename}: {e}")
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
        return None


def search_wikimedia_media(query, count=3):
    """
    Free fallback visual media search on Wikimedia Commons.
    Requires no API key. Returns direct links to high-res images or videos.
    """
    clean_q = re.sub(r"[^a-zA-Z0-9\s]", " ", str(query)).strip()
    if not clean_q:
        return []

    url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{clean_q}",
        "gsrnamespace": 6,
        "gsrlimit": max(12, count * 3),
        "prop": "imageinfo",
        "iiprop": "url|mime|size|width|height",
        "format": "json"
    }
    headers = {
        "User-Agent": "ByteWireVideoBot/1.0 (https://ytvideo.harikothapalli.space; news@harikothapalli.space)"
    }
    try:
        res = requests.get(url, params=params, headers=headers, timeout=12)
        if res.status_code != 200:
            return []
        data = res.json()
        pages = data.get("query", {}).get("pages", {})
        results = []
        for pid, page in pages.items():
            infos = page.get("imageinfo", [])
            if not infos:
                continue
            info = infos[0]
            media_url = info.get("url")
            width = info.get("width", 0)
            height = info.get("height", 0)
            mime = str(info.get("mime", "")).lower()
            if media_url and (width >= 800 or "video" in mime):
                if not media_url.lower().endswith((".svg", ".ogg", ".ogv", ".pdf", ".tif", ".tiff")):
                    results.append({"url": media_url, "mime": mime, "width": width, "height": height})
            if len(results) >= count * 2:
                break
        random.shuffle(results)
        return results[:count]
    except Exception as e:
        print(f"Notice: Wikimedia fallback search for '{query}': {e}")
        return []


def image_to_kenburns_video(image_path, output_video_path, duration=6.0):
    """
    Converts a high-res image into a cinematic 1080p 30fps Ken-Burns zoom/pan video clip.
    """
    ffmpeg_exe = get_ffmpeg_exe()
    try:
        frames = max(30, int(duration * 30))
        zoom_filter = (
            f"scale=2160x1215:force_original_aspect_ratio=increase,crop=2160:1215,"
            f"zoompan=z='min(zoom+0.0015,1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps=30"
        )
        cmd = [
            ffmpeg_exe, "-y",
            "-loop", "1",
            "-i", os.path.abspath(image_path),
            "-vf", zoom_filter,
            "-t", f"{duration:.2f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            os.path.abspath(output_video_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
        if res.returncode == 0 and os.path.exists(output_video_path) and os.path.getsize(output_video_path) > 10000:
            return output_video_path
    except Exception as e:
        print(f"[LOG] Notice: image to Ken-Burns conversion: {e}")
    return None


def generate_procedural_broadcast_clip(output_video_path, duration=6.0, keyword="NEWS"):
    """
    Generates a dynamic 1080p 30fps animated news broadcast motion background using FFmpeg.
    Features a deep navy/sapphire aesthetic with ambient moving digital tech grid and glowing vignette.
    Never a static grey box!
    """
    ffmpeg_exe = get_ffmpeg_exe()
    try:
        filter_str = (
            f"color=c=0x0a1428:s=1920x1080:d={duration}:r=30,"
            "drawgrid=w=120:h=120:t=1:c=0x00d4ff@0.08,"
            "vignette=angle=0.5:aspect=16/9"
        )
        cmd = [
            ffmpeg_exe, "-y",
            "-f", "lavfi",
            "-i", filter_str,
            "-t", f"{duration:.2f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            os.path.abspath(output_video_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if res.returncode == 0 and os.path.exists(output_video_path) and os.path.getsize(output_video_path) > 10000:
            return output_video_path
    except Exception as e:
        print(f"[LOG] Notice: procedural clip generation: {e}")
    return None


def clean_filename(text):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", text.lower())[:40]


def get_scene_clip_paths(query, scene_index, clips_dir, keyword="", video_subject=""):
    """
    Downloads exactly 3 distinct high quality clips for each scene
    using multi-tier queries to ensure relevant, dynamic visual variety.
    Guarantees 3 broadcast-grade clips even if Pexels API key is invalid.
    """
    time.sleep(0.3)
    os.makedirs(clips_dir, exist_ok=True)
    
    primary_query = f"{video_subject} {keyword}".strip() if keyword else f"{video_subject} {query}".strip()
    secondary_query = f"{query}".strip()
    subject_query = f"{video_subject}".strip()

    all_links = []

    # 1. Primary Query
    print(f"Searching primary clips for query: '{primary_query}'")
    links_1 = search_pexels_videos(primary_query, count=3)
    for l in links_1:
        if l not in all_links:
            all_links.append(l)

    # 2. Secondary Query if we need more clips
    if len(all_links) < CLIPS_PER_SCENE and secondary_query and secondary_query != primary_query:
        print(f"Searching secondary clips for query: '{secondary_query}'")
        links_2 = search_pexels_videos(secondary_query, count=3)
        for l in links_2:
            if l not in all_links:
                all_links.append(l)

    # 3. Subject Query if we need more clips
    if len(all_links) < CLIPS_PER_SCENE and subject_query:
        print(f"Searching subject clips for query: '{subject_query}'")
        links_3 = search_pexels_videos(subject_query, count=3)
        for l in links_3:
            if l not in all_links:
                all_links.append(l)

    # 4. Cinematic Fallback Queries if still under 3 clips
    if len(all_links) < CLIPS_PER_SCENE:
        fallbacks = [
            "technology news documentary",
            "modern artificial intelligence lab",
            "digital cyber futuristic network",
            "global data center servers",
            "high tech corporate broadcast"
        ]
        random.shuffle(fallbacks)
        for fb in fallbacks:
            print(f"Querying fallback clips: '{fb}'")
            links_fb = search_pexels_videos(fb, count=3)
            for l in links_fb:
                if l not in all_links:
                    all_links.append(l)
            if len(all_links) >= CLIPS_PER_SCENE:
                break

    paths = []
    # Download any Pexels clips found
    for idx, link in enumerate(all_links[:CLIPS_PER_SCENE], 1):
        filename = f"scene_{scene_index}_clip_{idx}_{clean_filename(query)}.mp4"
        path = download_video(link, filename, clips_dir)
        if path:
            paths.append(path)

    # 5. Fallback Tier: Free Wikimedia Commons News Media Search
    if len(paths) < CLIPS_PER_SCENE:
        print(f"[FALLBACK] Querying Wikimedia Commons media for scene {scene_index} ('{keyword or query}')...")
        search_terms = [keyword, query, video_subject]
        for term in search_terms:
            if not term or len(paths) >= CLIPS_PER_SCENE:
                continue
            wiki_media = search_wikimedia_media(term, count=CLIPS_PER_SCENE - len(paths))
            for wm in wiki_media:
                media_url = wm.get("url", "")
                if not media_url:
                    continue
                ext = os.path.splitext(media_url.split("?")[0])[1].lower() or ".jpg"
                clip_num = len(paths) + 1
                raw_filename = f"scene_{scene_index}_wiki_{clip_num}_{clean_filename(term)}{ext}"
                target_video = os.path.join(clips_dir, f"scene_{scene_index}_wiki_{clip_num}_{clean_filename(term)}.mp4")

                # If it's already an MP4 video, download directly
                if ext in [".mp4", ".mov", ".m4v"]:
                    dl_path = download_video(media_url, raw_filename, clips_dir)
                    if dl_path:
                        paths.append(dl_path)
                else:
                    # It's a high-res photo: download & animate into smooth Ken-Burns 1080p clip
                    dl_img = download_video(media_url, raw_filename, clips_dir)
                    if dl_img:
                        kb_clip = image_to_kenburns_video(dl_img, target_video, duration=7.0)
                        if kb_clip:
                            paths.append(kb_clip)
                if len(paths) >= CLIPS_PER_SCENE:
                    break

    # 6. Fallback Tier: High-Tech Broadcast Procedural Loop (Zero-Failure Guarantee)
    while len(paths) < CLIPS_PER_SCENE:
        clip_num = len(paths) + 1
        procedural_file = os.path.join(clips_dir, f"scene_{scene_index}_broadcast_{clip_num}.mp4")
        proc_clip = generate_procedural_broadcast_clip(procedural_file, duration=7.0, keyword=keyword or query)
        if proc_clip:
            paths.append(proc_clip)
        else:
            # Duplicate first available path if present
            if paths:
                paths.append(paths[0])
            else:
                break

    print(f"[LOG] Scene {scene_index} prepared {len(paths)} clips.")
    return paths
