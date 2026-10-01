import os
import sys
import re
import json
import argparse
import subprocess
from dotenv import load_dotenv

import gemini

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def get_ffmpeg_exe():
    """Locate FFmpeg executable from PATH or imageio_ffmpeg."""
    import shutil
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def parse_facts_from_script(script_text):
    """
    Parses 'Fact 1' through 'Fact 10' from the news narration script.
    """
    if not script_text:
        return []

    facts = []
    # Pattern to match: Fact <number>\n<Title>\n<Description>
    pattern = r"(?:Fact|FACT)\s+(\d+)[\s:\-\.]*\n([^\n]+)\n([\s\S]*?)(?=(?:(?:Fact|FACT)\s+\d+|Outro|OUTRO|$))"
    matches = list(re.finditer(pattern, script_text))

    for m in matches:
        fact_num = int(m.group(1))
        title = m.group(2).strip().strip("[]*")
        desc = m.group(3).strip().strip("[]*")
        facts.append({
            "factIndex": fact_num,
            "title": title,
            "description": desc,
            "full_text": f"{title}. {desc}".strip()
        })

    # If regex missed any facts due to unexpected format, fall back to line chunking
    if len(facts) < 5:
        facts = []
        lines = [line.strip() for line in script_text.splitlines() if line.strip()]
        current_fact = None
        for line in lines:
            fact_match = re.match(r"^(?:Fact|FACT)\s+(\d+)", line, re.IGNORECASE)
            if fact_match:
                if current_fact:
                    facts.append(current_fact)
                current_fact = {
                    "factIndex": int(fact_match.group(1)),
                    "title": "",
                    "description": "",
                    "full_text": ""
                }
            elif current_fact:
                if not current_fact["title"]:
                    current_fact["title"] = line.strip("[]*")
                else:
                    current_fact["description"] += " " + line.strip("[]*")
                    current_fact["description"] = current_fact["description"].strip()
        if current_fact:
            facts.append(current_fact)

    # Sort by factIndex
    facts.sort(key=lambda x: x["factIndex"])
    return facts


def detect_fact_timestamps(facts, audio_words, total_duration, intro_offset=0.0):
    """
    Calculates exact start and end timestamps in seconds for each fact within the final video.
    """
    if not facts:
        return []

    # Clean words helper
    def clean(w):
        return re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", str(w).lower()).strip()

    count = len(facts)
    fact_starts = [None] * count

    if audio_words and len(audio_words) > 20:
        words_list = audio_words
        w_len = len(words_list)

        for idx, fact in enumerate(facts):
            f_idx = fact["factIndex"]
            # Look for "fact <idx>" or first distinct words of the title
            target_words = [clean(w) for w in fact["title"].split() if len(clean(w)) > 2][:4]
            num_str = str(f_idx)
            
            matched_time = None

            # First priority: find "fact" followed by the number
            for i in range(w_len - 1):
                if words_list[i]["word"] in ["fact", "number"] and words_list[i + 1]["word"] == num_str:
                    matched_time = words_list[i]["start"]
                    break

            # Second priority: match title words sequence
            if matched_time is None and target_words:
                for i in range(w_len - len(target_words)):
                    matches = 0
                    for j, tw in enumerate(target_words):
                        if words_list[i + j]["word"] == tw:
                            matches += 1
                    if matches >= max(2, len(target_words) - 1):
                        matched_time = words_list[i]["start"]
                        break

            fact_starts[idx] = matched_time

    # Validate and fill missing timestamps with proportional interpolation
    usable_duration = max(10.0, total_duration - intro_offset)
    proportional_step = usable_duration / (count + 1)  # reserve space for intro/outro

    for idx in range(count):
        if fact_starts[idx] is None:
            # Estimate start based on position
            estimated_start = (idx + 0.5) * proportional_step
            fact_starts[idx] = estimated_start

    # Ensure strictly increasing start times
    for idx in range(1, count):
        if fact_starts[idx] <= fact_starts[idx - 1]:
            fact_starts[idx] = fact_starts[idx - 1] + 10.0

    # Build final segments with intro_offset
    segments = []
    for idx in range(count):
        start_audio = fact_starts[idx]
        if idx < count - 1:
            end_audio = fact_starts[idx + 1]
        else:
            # Last fact ends at total duration minus outro buffer (approx 8s) or total_duration
            end_audio = min(total_duration - intro_offset, start_audio + 30.0)

        # Ensure reasonable short duration (between 10 and 60 seconds)
        duration = end_audio - start_audio
        if duration < 8.0:
            end_audio = start_audio + 12.0
        elif duration > 60.0:
            end_audio = start_audio + 58.0

        v_start = round(intro_offset + start_audio, 2)
        v_end = round(min(total_duration, intro_offset + end_audio), 2)

        segments.append({
            "factIndex": facts[idx]["factIndex"],
            "title": facts[idx]["title"],
            "description": facts[idx]["description"],
            "startTime": v_start,
            "endTime": v_end,
            "duration": round(v_end - v_start, 2)
        })

    return segments


def create_vertical_short(ffmpeg_exe, full_video_path, output_short_path, output_thumb_path, start_time, end_time):
    """
    Slices the specified time range from full_video_path and crops/scales it
    to standard 9:16 vertical resolution (1080x1920).
    """
    duration = max(3.0, end_time - start_time)

    # FFmpeg filter: scale to fit 1080x1920 then center crop to exact 9:16
    vf_filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"

    cmd = [
        ffmpeg_exe,
        "-y",
        "-ss", str(start_time),
        "-t", str(duration),
        "-i", full_video_path,
        "-vf", vf_filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        output_short_path
    ]

    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Extract high quality 9:16 thumbnail frame
    thumb_time = min(1.5, duration / 2.0)
    thumb_cmd = [
        ffmpeg_exe,
        "-y",
        "-ss", str(thumb_time),
        "-i", output_short_path,
        "-vframes", "1",
        "-q:v", "2",
        output_thumb_path
    ]
    subprocess.run(thumb_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def extract_all_shorts(
    job_id,
    video_path,
    script_text,
    audio_words=None,
    intro_offset=0.0,
    subject="news",
    language="english",
    video_storage_dir=None,
    thumbnail_storage_dir=None
):
    """
    Main coordinator to turn a full video into 10 vertical 9:16 Shorts with
    custom YouTube Shorts metadata (Title, Description, Tags) generated in 1 API request.
    """
    ffmpeg_exe = get_ffmpeg_exe()

    # Determine storage folders
    v_dir = video_storage_dir or os.getenv("VIDEO_STORAGE_DIR", "videos")
    t_dir = thumbnail_storage_dir or os.getenv("THUMBNAIL_STORAGE_DIR", "thumbnails")

    shorts_video_dir = os.path.join(v_dir, "shorts")
    shorts_thumb_dir = os.path.join(t_dir, "shorts")
    os.makedirs(shorts_video_dir, exist_ok=True)
    os.makedirs(shorts_thumb_dir, exist_ok=True)

    # 1. Parse facts from script
    facts = parse_facts_from_script(script_text)
    if not facts:
        print("[LOG] Warning: No structured facts found in script. Generating 10 synthetic fact markers.")
        for i in range(1, 11):
            facts.append({
                "factIndex": i,
                "title": f"Story #{i} from {subject.title()}",
                "description": f"Key breaking update #{i} regarding {subject}.",
                "full_text": f"Story #{i}"
            })

    # 2. Get total video duration
    total_duration = 180.0
    try:
        probe_cmd = [
            ffmpeg_exe, "-i", video_path
        ]
        res = subprocess.run(probe_cmd, stderr=subprocess.PIPE, text=True, errors="ignore")
        dur_match = re.search(r"Duration:\s*(\d+):(\d+):([0-9.]+)", res.stderr)
        if dur_match:
            total_duration = int(dur_match.group(1)) * 3600 + int(dur_match.group(2)) * 60 + float(dur_match.group(3))
    except Exception as e:
        print(f"[LOG] Duration probe warning: {e}")

    # 3. Detect exact timestamps for each fact
    fact_segments = detect_fact_timestamps(facts, audio_words, total_duration, intro_offset)
    print(f"[LOG] Slicing video into {len(fact_segments)} 9:16 vertical shorts (Duration: {total_duration:.1f}s)...")

    # 4. Generate Shorts Metadata in ONE single API request to Gemini
    print("[LOG] Generating dedicated YouTube Shorts metadata (Title, Description, Tags) for all 10 shorts...")
    shorts_meta_list = gemini.generate_shorts_metadata(fact_segments, subject, language)
    meta_by_index = {item.get("fact_index", idx + 1): item for idx, item in enumerate(shorts_meta_list)}

    completed_shorts = []

    # 5. Extract each short via FFmpeg in 9:16 format
    for idx, seg in enumerate(fact_segments, 1):
        f_idx = seg["factIndex"]
        short_filename = f"{job_id}_short_{f_idx}.mp4"
        thumb_filename = f"{job_id}_short_{f_idx}.png"

        short_filepath = os.path.join(shorts_video_dir, short_filename)
        thumb_filepath = os.path.join(shorts_thumb_dir, thumb_filename)

        print(f"[LOG] Rendering Short {idx}/{len(fact_segments)}: Fact {f_idx} [{seg['startTime']}s -> {seg['endTime']}s] to 9:16...")
        try:
            create_vertical_short(
                ffmpeg_exe,
                video_path,
                short_filepath,
                thumb_filepath,
                seg["startTime"],
                seg["endTime"]
            )

            meta = meta_by_index.get(f_idx, {})
            short_title = meta.get("title", f"Fact #{f_idx}: {seg['title'][:40]} 🚨 #Shorts")
            short_desc = meta.get("description", f"{seg['description'][:140]} #shorts #news")
            short_tags = meta.get("tags", ["shorts", "news", "trending", subject])

            completed_shorts.append({
                "factIndex": f_idx,
                "title": short_title,
                "factTitle": seg["title"],
                "scriptText": seg["description"],
                "videoPath": f"/videos/shorts/{short_filename}",
                "thumbnail": f"/thumbnails/shorts/{thumb_filename}",
                "duration": seg["duration"],
                "aspectRatio": "9:16",
                "youtubeMetadata": {
                    "title": short_title,
                    "description": short_desc,
                    "tags": short_tags
                }
            })
            print(f"[LOG] Short {f_idx} rendered successfully: {short_filename} ({seg['duration']}s)")
        except Exception as e:
            print(f"[LOG] Error rendering short {f_idx}: {e}")

    return {
        "facts": fact_segments,
        "shorts": completed_shorts
    }


def main():
    parser = argparse.ArgumentParser(description="ByteWire 9:16 Shorts Generator")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--video-path", required=True)
    parser.add_argument("--script-path", default="")
    parser.add_argument("--words-path", default="")
    parser.add_argument("--subject", default="news")
    parser.add_argument("--language", default="english")
    parser.add_argument("--intro-offset", type=float, default=0.0)

    args = parser.parse_args()

    script_text = ""
    if args.script_path and os.path.exists(args.script_path):
        with open(args.script_path, "r", encoding="utf-8") as f:
            script_text = f.read()

    audio_words = None
    if args.words_path and os.path.exists(args.words_path):
        try:
            with open(args.words_path, "r", encoding="utf-8") as f:
                audio_words = json.load(f)
        except Exception as e:
            print(f"[LOG] Warning reading words: {e}")

    result = extract_all_shorts(
        job_id=args.job_id,
        video_path=args.video_path,
        script_text=script_text,
        audio_words=audio_words,
        intro_offset=args.intro_offset,
        subject=args.subject,
        language=args.language
    )

    # Output structured markers for videoQueue or node process
    print("@SHORTS_RESULT_START@")
    print(json.dumps(result))
    print("@SHORTS_RESULT_END@")


if __name__ == "__main__":
    main()
