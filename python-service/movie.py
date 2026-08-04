import os
import math
import re
import random
import requests
from dotenv import load_dotenv

from moviepy import (
    VideoFileClip,
    AudioFileClip,
    concatenate_videoclips,
    CompositeVideoClip,
    ColorClip,
    CompositeAudioClip,
    TextClip,
    vfx
)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

FINAL_WIDTH = 1280
FINAL_HEIGHT = 720
FPS = 24

DEFAULT_MUSIC_URL = "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3"


def download_default_music(music_path):
    print(f"Background music missing. Downloading default track from {DEFAULT_MUSIC_URL} ...")
    try:
        response = requests.get(DEFAULT_MUSIC_URL, stream=True, timeout=30)
        response.raise_for_status()
        with open(music_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 64):
                if chunk:
                    f.write(chunk)
        print("Default background music downloaded successfully.")
    except Exception as e:
        print(f"Failed to download background music: {e}. Video will render without background music.")


def clean_word(word):
    return re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", word.lower()).strip()


def srt_time_to_seconds(time_str):
    h, m, s_ms = time_str.split(":")
    s, ms = s_ms.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_srt_file(srt_path):
    if not os.path.exists(srt_path):
        print(f"SRT file not found: {srt_path}. Subtitles will be skipped.")
        return []

    with open(srt_path, "r", encoding="utf-8", errors="ignore") as file:
        content = file.read().strip()

    blocks = re.split(r"\n\s*\n", content)
    subtitles = []

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        time_line = lines[1]
        if "-->" not in time_line:
            continue
        start_text, end_text = time_line.split("-->")
        start = srt_time_to_seconds(start_text.strip())
        end = srt_time_to_seconds(end_text.strip())
        text = " ".join(lines[2:]).strip()
        if text:
            subtitles.append({
                "start": start,
                "end": end,
                "text": text
            })

    return subtitles


def resize_crop(clip):
    clip_ratio = clip.w / clip.h
    target_ratio = FINAL_WIDTH / FINAL_HEIGHT

    if clip_ratio > target_ratio:
        clip = clip.resized(height=FINAL_HEIGHT)
        clip = clip.cropped(
            x_center=clip.w / 2,
            width=FINAL_WIDTH,
            height=FINAL_HEIGHT
        )
    else:
        clip = clip.resized(width=FINAL_WIDTH)
        clip = clip.cropped(
            y_center=clip.h / 2,
            width=FINAL_WIDTH,
            height=FINAL_HEIGHT
        )

    return clip


def apply_zoom(clip, duration):
    def zoom(t):
        return 1.0 + 0.05 * (t / duration)
    return clip.resized(zoom)


def create_scene_from_paths(paths, duration):
    clips = []
    part_duration = duration / len(paths)

    for path in paths:
        try:
            clip = VideoFileClip(path).without_audio()
            clip = resize_crop(clip)

            if clip.duration < part_duration:
                repeat_count = math.ceil(part_duration / clip.duration)
                clip = concatenate_videoclips([clip] * repeat_count)

            clip = clip.subclipped(0, part_duration)
            clip = apply_zoom(clip, part_duration)
            clips.append(clip)
        except Exception as e:
            print(f"Error processing clip '{path}': {e}")

    if not clips:
        return ColorClip(
            size=(FINAL_WIDTH, FINAL_HEIGHT),
            color=(20, 20, 20)
        ).with_duration(duration)

    processed = []
    for idx, clip in enumerate(clips):
        effects = []
        if idx > 0:
            effects.append(vfx.FadeIn(0.4))
        if idx < len(clips) - 1:
            effects.append(vfx.FadeOut(0.4))
        if effects:
            clip = clip.with_effects(effects)
        processed.append(clip)

    base = concatenate_videoclips(processed, method="compose")
    if base.duration > duration:
        base = base.subclipped(0, duration)

    dark_overlay = ColorClip(
        size=(FINAL_WIDTH, FINAL_HEIGHT),
        color=(0, 0, 0)
    ).with_opacity(0.15).with_duration(base.duration)

    return CompositeVideoClip([base, dark_overlay], size=(FINAL_WIDTH, FINAL_HEIGHT)).with_duration(base.duration)


def match_scenes_to_audio(scenes, audio_words, audio_duration):
    matched = []
    used_times = []

    for scene in scenes:
        keyword = clean_word(scene["keyword"])
        found_time = None

        for audio_word in audio_words:
            if keyword == audio_word["word"]:
                found_time = audio_word["start"]
                break

        if found_time is not None:
            too_close = any(abs(found_time - t) < 3.0 for t in used_times)
            if not too_close:
                matched.append({
                    **scene,
                    "start": found_time
                })
                used_times.append(found_time)

    matched.sort(key=lambda x: x["start"])

    if len(matched) < 3:
        print("Not enough scene matches. Using equal timing fallback.")
        part = audio_duration / len(scenes)
        matched = []
        for idx, scene in enumerate(scenes):
            matched.append({
                **scene,
                "start": idx * part
            })

    timeline = []
    current_time = 0

    for idx, scene in enumerate(matched):
        start = scene["start"]
        if start > current_time:
            start = current_time

        if idx + 1 < len(matched):
            end = matched[idx + 1]["start"]
        else:
            end = audio_duration

        duration = end - start
        if duration < 0.5:
            continue

        timeline.append({
            **scene,
            "start": start,
            "end": end,
            "duration": duration
        })
        current_time = end

    if timeline and timeline[-1]["end"] < audio_duration:
        timeline[-1]["end"] = audio_duration
        timeline[-1]["duration"] = timeline[-1]["end"] - timeline[-1]["start"]

    return timeline


def compile_video(timeline, clips_dir, voice_path, srt_path, music_path, output_path, use_music=True, use_subtitles=True, video_subject="", intro_path=None):
    print("Loading narration audio...")
    voice_audio = AudioFileClip(voice_path)
    audio_duration = voice_audio.duration

    final_clips = []
    from pexels import get_scene_clip_paths

    for idx, item in enumerate(timeline):
        query = item["search_query"]
        duration = item["duration"]
        keyword = item.get("keyword", "")

        print(f"\n[LOG] Processing scene {idx + 1}/{len(timeline)}: '{query}' ({duration:.2f}s)")
        
        paths = get_scene_clip_paths(
            query=query,
            scene_index=idx + 1,
            clips_dir=clips_dir,
            keyword=keyword,
            video_subject=video_subject
        )

        scene_clip = create_scene_from_paths(paths, duration)
        final_clips.append(scene_clip)

    print("\n[LOG] Concatenating scenes...")
    final_clips_with_fades = []
    for idx, clip in enumerate(final_clips):
        effects = []
        if idx > 0:
            effects.append(vfx.FadeIn(0.4))
        if idx < len(final_clips) - 1:
            effects.append(vfx.FadeOut(0.4))
        if effects:
            clip = clip.with_effects(effects)
        final_clips_with_fades.append(clip)

    video = concatenate_videoclips(final_clips_with_fades, method="compose")
    if video.duration > audio_duration:
        video = video.subclipped(0, audio_duration)

    if use_subtitles:
        print("[LOG] Overlaying subtitles...")
        subtitles = parse_srt_file(srt_path)
        subtitle_clips = []

        for sub in subtitles:
            duration = sub["end"] - sub["start"]
            if duration <= 0:
                continue

            txt_clip = TextClip(
                text=sub["text"],
                font_size=38,
                color="white",
                stroke_color="black",
                stroke_width=2,
                method="caption",
                size=(FINAL_WIDTH - 160, None),
                text_align="center"
            ).with_start(sub["start"]).with_duration(duration).with_position(
                ("center", FINAL_HEIGHT - 120)
            )
            subtitle_clips.append(txt_clip)

        if subtitle_clips:
            video = CompositeVideoClip(
                [video, *subtitle_clips],
                size=(FINAL_WIDTH, FINAL_HEIGHT)
            ).with_duration(video.duration)

    print("[LOG] Mixing audio tracks...")
    if use_music:
        if not os.path.exists(music_path):
            download_default_music(music_path)

        if os.path.exists(music_path):
            try:
                music = AudioFileClip(music_path)
                if music.duration < audio_duration:
                    repeat = math.ceil(audio_duration / music.duration)
                    music = concatenate_videoclips([music] * repeat)

                music = music.subclipped(0, audio_duration)
                music = music.with_volume_scaled(0.06)
                voice_audio = voice_audio.with_volume_scaled(1.0)
                final_audio = CompositeAudioClip([music, voice_audio])
            except Exception as e:
                print(f"Error mixing music audio: {e}. Using voice only.")
                final_audio = voice_audio
        else:
            final_audio = voice_audio
    else:
        final_audio = voice_audio

    video = video.with_audio(final_audio)

    # Check candidate intro video paths if not explicitly passed
    if not intro_path:
        candidates = [
            os.path.join(os.path.dirname(__file__), "..", "..", "intro.mp4"),
            os.path.join(os.path.dirname(__file__), "..", "intro.mp4"),
            os.path.join(os.path.dirname(__file__), "intro.mp4"),
            "intro.mp4"
        ]
        for c in candidates:
            if os.path.exists(c):
                intro_path = c
                break

    if intro_path and os.path.exists(intro_path):
        print(f"[LOG] Prepending intro video from '{intro_path}' without glitches...")
        try:
            intro_clip = VideoFileClip(intro_path)
            intro_clip = resize_crop(intro_clip)
            video = concatenate_videoclips([intro_clip, video], method="compose")
            print(f"[LOG] Intro video prepended successfully ({intro_clip.duration:.2f}s). Total duration: {video.duration:.2f}s")
        except Exception as e:
            print(f"[LOG] Warning: Failed to attach intro video: {e}")

    print(f"\n[LOG] Encoding and writing final MP4 file to {output_path} ...")
    video.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="medium",
        bitrate="8000k",
        threads=4
    )
    print("[LOG] Video rendering completed successfully.")
    
    video.close()
    voice_audio.close()


def generate_thumbnail(video_path, thumbnail_path):
    print(f"[LOG] Generating thumbnail at 3.0s: {thumbnail_path}")
    try:
        clip = VideoFileClip(video_path)
        clip.save_frame(thumbnail_path, t=min(3.0, clip.duration - 0.1))
        clip.close()
        print("[LOG] Thumbnail generated successfully.")
        return True
    except Exception as e:
        print(f"Failed to generate thumbnail: {e}")
        return False
