import os
import re
import time
import random
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

CLIPS_PER_SCENE = 3


def search_pexels_videos(query, count=3):
    if not PEXELS_API_KEY:
        print("Warning: PEXELS_API_KEY is not configured in .env.")
        return []

    url = "https://api.pexels.com/videos/search"
    headers = {
        "Authorization": PEXELS_API_KEY
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


def clean_filename(text):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", text.lower())[:40]


def get_scene_clip_paths(query, scene_index, clips_dir, keyword="", video_subject=""):
    """
    Downloads exactly 3 distinct high quality clips for each scene
    using multi-tier queries to ensure relevant, dynamic visual variety.
    """
    time.sleep(0.4)
    
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

    # If still not enough, repeat existing links to guarantee 3 clips
    while len(all_links) < CLIPS_PER_SCENE and len(all_links) > 0:
        all_links.append(all_links[len(all_links) % len(all_links)])

    final_links = all_links[:CLIPS_PER_SCENE]
    paths = []

    for idx, link in enumerate(final_links, 1):
        filename = f"scene_{scene_index}_clip_{idx}_{clean_filename(query)}.mp4"
        path = download_video(link, filename, clips_dir)
        if path:
            paths.append(path)

    # Ensure 3 paths: if one download failed, clone the first successful one
    if paths and len(paths) < CLIPS_PER_SCENE:
        print(f"Warning: Only downloaded {len(paths)}/{CLIPS_PER_SCENE} clips. Duplicating to guarantee 3 clips for scene {scene_index}.")
        while len(paths) < CLIPS_PER_SCENE:
            paths.append(paths[0])

    print(f"[LOG] Scene {scene_index} prepared {len(paths)} clips.")
    return paths
