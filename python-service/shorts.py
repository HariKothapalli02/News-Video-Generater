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


NUMBER_WORDS = {
    1: ["1", "one", "first", "1st", "ek", "pahla", "pehla", "okati", "modata"],
    2: ["2", "two", "second", "2nd", "do", "dusra", "doosra", "rendu", "rendava"],
    3: ["3", "three", "third", "3rd", "teen", "teesra", "tisra", "moodu", "moodava"],
    4: ["4", "four", "fourth", "4th", "char", "chautha", "nalugu", "naalugava"],
    5: ["5", "five", "fifth", "5th", "paanch", "panch", "aidu", "aidava"],
    6: ["6", "six", "sixth", "6th", "chhah", "che", "aaru", "aarava"],
    7: ["7", "seven", "seventh", "7th", "saat", "yedu", "yedava"],
    8: ["8", "eight", "eighth", "8th", "aath", "enimidi", "enimidava"],
    9: ["9", "nine", "ninth", "9th", "nau", "tommidi", "tommidava"],
    10: ["10", "ten", "tenth", "10th", "das", "padi", "padava"]
}


def clean_token(w):
    return re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", str(w).lower()).strip()


def parse_facts_from_script(script_text):
    """
    Parses 'Fact 1' through 'Fact N' from the news narration script.
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

    # If regex found no facts due to unexpected formatting, fall back to line chunking
    if not facts:
        lines = [line.strip() for line in script_text.splitlines() if line.strip()]
        current_fact = None
        for line in lines:
            fact_match = re.match(r"^(?:Fact|FACT)\s+(\d+)", line, re.IGNORECASE)
            if fact_match:
                if current_fact:
                    current_fact["full_text"] = f"{current_fact['title']}. {current_fact['description']}".strip()
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
            current_fact["full_text"] = f"{current_fact['title']}. {current_fact['description']}".strip()
            facts.append(current_fact)

    # Sort by factIndex and limit to top 3 facts for exactly 3 shorts
    facts.sort(key=lambda x: x["factIndex"])
    return facts[:3]


def detect_fact_timestamps(facts, audio_words, total_duration, intro_offset=0.0):
    """
    Calculates exact start and end timestamps in seconds for each fact within the final video.
    Guarantees clean boundary cuts without the next fact's number (e.g. 'Fact two') bleeding into the short.
    """
    if not facts:
        return []

    count = len(facts)
    fact_starts = [None] * count
    fact_start_indices = [None] * count

    if audio_words and len(audio_words) > 5:
        words_list = audio_words
        w_len = len(words_list)
        curr_search_idx = 0

        for idx, fact in enumerate(facts):
            f_idx = fact["factIndex"]
            valid_nums = set(NUMBER_WORDS.get(f_idx, [str(f_idx)]))
            target_words = [clean_token(w) for w in fact["title"].split() if len(clean_token(w)) > 2][:4]

            matched_time = None
            matched_idx = None

            # Priority 1: Find spoken marker "fact" / "number" / "story" followed by number word or digit
            for i in range(curr_search_idx, w_len - 1):
                w1 = clean_token(words_list[i]["word"])
                w2 = clean_token(words_list[i + 1]["word"])
                if w1 in ["fact", "number", "story", "topic", "point"] and w2 in valid_nums:
                    matched_time = words_list[i]["start"]
                    matched_idx = i
                    break
                # Handle merged tokens like "fact1", "fact2", "factone", "facttwo"
                if w1.startswith("fact") and any(w1.endswith(num) for num in valid_nums):
                    matched_time = words_list[i]["start"]
                    matched_idx = i
                    break

            # Priority 2: Match sequence of distinct title words if marker was not found
            if matched_time is None and target_words:
                target_len = min(4, len(target_words))
                target = target_words[:target_len]
                for i in range(curr_search_idx, w_len - target_len + 1):
                    matches = 0
                    for j, tw in enumerate(target):
                        if clean_token(words_list[i + j]["word"]) == tw:
                            matches += 1
                    if matches >= max(2, target_len - 1):
                        matched_time = words_list[i]["start"]
                        matched_idx = i
                        break

            if matched_time is not None:
                fact_starts[idx] = matched_time
                fact_start_indices[idx] = matched_idx
                # Advance search pointer past the start of this fact
                curr_search_idx = min(w_len - 1, matched_idx + 1)

    # Validate and fill missing start timestamps with proportional interpolation
    usable_duration = max(10.0, total_duration - intro_offset)
    proportional_step = usable_duration / (count + 1)  # reserve space for intro/outro

    for idx in range(count):
        if fact_starts[idx] is None:
            estimated_start = (idx + 0.5) * proportional_step
            fact_starts[idx] = estimated_start

    # Ensure strictly increasing start times with at least 8s spacing
    for idx in range(1, count):
        if fact_starts[idx] <= fact_starts[idx - 1]:
            fact_starts[idx] = fact_starts[idx - 1] + 10.0

    # Build final segments with intro_offset and precise end times
    segments = []
    w_len = len(audio_words) if audio_words else 0

    for idx in range(count):
        start_audio = fact_starts[idx]

        # Determine exact end timestamp
        if idx < count - 1:
            next_start = fact_starts[idx + 1]
            next_idx = fact_start_indices[idx + 1]

            # If we know the exact audio word index where next fact begins:
            if audio_words and next_idx is not None and next_idx > 0:
                # The word before next fact's start is the last word of current fact
                last_word_idx = next_idx - 1
                last_word_end = audio_words[last_word_idx]["end"]
                # Cut cleanly during the silence gap: right after the last word finishes (+0.35s),
                # and strictly before the next fact begins (at least 0.3s buffer)
                end_audio = min(last_word_end + 0.35, next_start - 0.3)
            else:
                # Fallback: cut 0.5s before next fact's start to avoid any bleed into next fact
                end_audio = next_start - 0.5
        else:
            # Last fact: check if outro starts or find last spoken word
            outro_start = None
            if audio_words:
                start_w_idx = fact_start_indices[idx] or 0
                for i in range(start_w_idx, w_len - 1):
                    w = clean_token(audio_words[i]["word"])
                    w_next = clean_token(audio_words[i + 1]["word"])
                    if (w in ["outro", "subscribe"]) or (w == "those" and w_next in ["were", "was"]):
                        outro_start = audio_words[i]["start"]
                        last_w_end = audio_words[i - 1]["end"] if i > 0 else outro_start - 0.5
                        end_audio = min(last_w_end + 0.35, outro_start - 0.3)
                        break

            if outro_start is None:
                # If no outro marker found, end before total duration minus outro buffer
                end_audio = min(total_duration - intro_offset, start_audio + 45.0)

        # Enforce minimum and maximum duration constraints for YouTube Shorts
        duration = end_audio - start_audio
        if duration < 8.0:
            end_audio = start_audio + 12.0
        elif duration > 58.0:
            end_audio = start_audio + 58.0

        # Guarantee end_audio never exceeds or bleeds into next_start for non-last facts
        if idx < count - 1:
            end_audio = min(end_audio, fact_starts[idx + 1] - 0.25)

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


def create_vertical_short(ffmpeg_exe, video_source_path, output_short_path, output_thumb_path, start_time, end_time, is_already_vertical=False):
    """
    Slices the specified time range and outputs 9:16 vertical video.
    If is_already_vertical is True, slices with ultrafast re-encode without scaling overhead.
    """
    duration = max(3.0, end_time - start_time)

    if is_already_vertical:
        cmd = [
            ffmpeg_exe,
            "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", video_source_path,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-c:a", "copy",
            output_short_path
        ]
    else:
        vf_filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
        cmd = [
            ffmpeg_exe,
            "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", video_source_path,
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-c:a", "aac",
            "-b:a", "192k",
            output_short_path
        ]

    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Extract high quality 9:16 thumbnail frame fast
    thumb_time = min(1.0, duration / 2.0)
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

    # 1. Parse facts from script (strictly top 3 shorts)
    facts = parse_facts_from_script(script_text)[:3]
    if not facts:
        print("[LOG] Warning: No structured facts found in script. Generating 3 synthetic fact markers.")
        for i in range(1, 4):
            facts.append({
                "factIndex": i,
                "title": f"Story #{i} from {subject.title()}",
                "description": f"Key breaking update #{i} regarding {subject}.",
                "full_text": f"Story #{i}"
            })
    facts = facts[:3]

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
    print(f"[LOG] Generating dedicated YouTube Shorts metadata (Title, Description, Tags) for all {len(fact_segments)} shorts...")
    shorts_meta_list = gemini.generate_shorts_metadata(fact_segments, subject, language)
    meta_by_index = {item.get("fact_index", idx + 1): item for idx, item in enumerate(shorts_meta_list)}

    # 5. Enlarge & Reshape Full Video to 9:16 in ONE single fast pass
    reshaped_full_vertical = os.path.join(shorts_video_dir, f"{job_id}_vertical_master.mp4")
    is_vertical_ready = False
    print("[LOG] Reshaping entire full video to 9:16 vertical in one single fast pass...")
    try:
        vf_filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
        reshape_cmd = [
            ffmpeg_exe, "-y",
            "-i", video_path,
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-c:a", "copy",
            reshaped_full_vertical
        ]
        subprocess.run(reshape_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(reshaped_full_vertical) and os.path.getsize(reshaped_full_vertical) > 1000:
            is_vertical_ready = True
            print(f"[LOG] Full video 9:16 master created! Slicing {len(fact_segments)} shorts rapidly...")
    except Exception as e:
        print(f"[LOG] Reshape warning: {e}. Falling back to per-slice crop.")

    source_video = reshaped_full_vertical if is_vertical_ready else video_path

    completed_shorts = []

    # 6. Extract each short from the 9:16 master video
    for idx, seg in enumerate(fact_segments, 1):
        f_idx = seg["factIndex"]
        short_filename = f"{job_id}_short_{f_idx}.mp4"
        thumb_filename = f"{job_id}_short_{f_idx}.png"

        short_filepath = os.path.join(shorts_video_dir, short_filename)
        thumb_filepath = os.path.join(shorts_thumb_dir, thumb_filename)

        print(f"[LOG] Slicing Short {idx}/{len(fact_segments)}: Fact {f_idx} [{seg['startTime']}s -> {seg['endTime']}s] to 9:16...")
        try:
            create_vertical_short(
                ffmpeg_exe,
                source_video,
                short_filepath,
                thumb_filepath,
                seg["startTime"],
                seg["endTime"],
                is_already_vertical=is_vertical_ready
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
            print(f"[LOG] Short {f_idx} sliced successfully: {short_filename} ({seg['duration']}s)")
        except Exception as e:
            print(f"[LOG] Error slicing short {f_idx}: {e}")

    # Clean up temporary vertical master
    if is_vertical_ready and os.path.exists(reshaped_full_vertical):
        try:
            os.remove(reshaped_full_vertical)
        except Exception:
            pass

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
