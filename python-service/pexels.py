import os
import re
import time
import random
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

CLIPS_PER_SCENE = 2


def search_pexels_videos(query, count=2):
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
        "per_page": 15
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
        random.shuffle(videos)

        links = []
        for video in videos:
            files = video.get("video_files", [])
            hd_files = [
                f for f in files
                if f.get("width", 0) >= 1280 and f.get("height", 0) >= 720
            ]
            chosen = hd_files[0] if hd_files else (files[0] if files else None)
            
            if chosen and chosen.get("link"):
                links.append(chosen["link"])
                if len(links) >= count:
                    break

        return links
    except Exception as e:
        print(f"Pexels search failed for query '{query}': {e}")
        return []


def download_video(url, filename, clips_dir):
    os.makedirs(clips_dir, exist_ok=True)
    path = os.path.join(clips_dir, filename)

    if os.path.exists(path):
        return path

    print(f"Downloading clip: {filename}")
    try:
        response = requests.get(url, stream=True, timeout=(15, 30))
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 64):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\rDownload Clip progress: {percent:.1f}% ({downloaded / (1024 * 1024):.2f}MB/{total_size / (1024 * 1024):.2f}MB)", end="", flush=True)
        print()
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
    return re.sub(r"[^a-zA-Z0-9_-]", "_", text.lower())[:50]


def get_scene_clip_paths(query, scene_index, clips_dir, keyword="", video_subject=""):
    time.sleep(0.5)
    
    primary_query = f"{video_subject} {keyword}".strip() if keyword else f"{video_subject} {query}".strip()
    secondary_query = f"{video_subject} {query}".strip() if keyword else ""
    subject_query = video_subject.strip()

    print(f"Searching primary clips for query: '{primary_query}'")
    primary_links = search_pexels_videos(primary_query, CLIPS_PER_SCENE)

    secondary_links = []
    if not primary_links and secondary_query:
        print(f"Primary query failed. Searching secondary query: '{secondary_query}'")
        secondary_links = search_pexels_videos(secondary_query, CLIPS_PER_SCENE)

    subject_links = []
    if not primary_links and not secondary_links and subject_query:
        print(f"Secondary query failed. Searching subject query: '{subject_query}'")
        subject_links = search_pexels_videos(subject_query, CLIPS_PER_SCENE)

    all_links = list(primary_links)
    for link in secondary_links:
        if link not in all_links:
            all_links.append(link)
    for link in subject_links:
        if link not in all_links:
            all_links.append(link)

    if not all_links:
        fallback_queries = ["cinematic tech", "futuristic tech", "abstract technology", "digital world", "server room"]
        fallback_query = random.choice(fallback_queries)
        print(f"All custom queries failed. Using general fallback query: '{fallback_query}'")
        all_links = search_pexels_videos(fallback_query, CLIPS_PER_SCENE)

    final_links = all_links[:CLIPS_PER_SCENE]
    paths = []

    for idx, link in enumerate(final_links, 1):
        filename = f"scene_{scene_index}_clip_{idx}_{clean_filename(query)}.mp4"
        path = download_video(link, filename, clips_dir)
        if path:
            paths.append(path)

    return paths
