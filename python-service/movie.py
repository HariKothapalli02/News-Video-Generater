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

# Full HD Resolution for broadcast-quality content
FINAL_WIDTH = 1920
FINAL_HEIGHT = 1080
FPS = 30

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
    return re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", str(word).lower()).strip()


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


import gc

def create_scene_from_paths(paths, duration):
    """
    Merges exactly 3 clips into a single cohesive scene with smooth crossfade
    transitions between clips.
    """
    if not paths:
        return ColorClip(
            size=(FINAL_WIDTH, FINAL_HEIGHT),
            color=(10, 10, 10)
        ).with_duration(duration)

    num_clips = len(paths)
    transition_dur = min(0.35, duration / (num_clips * 2.5)) if num_clips > 1 else 0.0
    
    # Calculate duration each individual clip must play so total overlaps sum to `duration`
    effective_slot = (duration + (num_clips - 1) * transition_dur) / num_clips

    processed_clips = []
    
    for idx, path in enumerate(paths):
        try:
            raw_clip = VideoFileClip(path).without_audio()
            clip = resize_crop(raw_clip)

            # Loop or extend clip if its native duration is shorter than needed
            if clip.duration < effective_slot:
                repeat_count = math.ceil(effective_slot / max(0.1, clip.duration))
                clip = concatenate_videoclips([clip] * repeat_count)

            clip = clip.subclipped(0, effective_slot)

            # Start time in the composite timeline
            start_time = idx * (effective_slot - transition_dur)
            clip = clip.with_start(start_time)

            # Apply smooth crossfade transition on entrance for clips after the first
            if idx > 0 and transition_dur > 0.05:
                clip = clip.with_effects([vfx.CrossFadeIn(transition_dur)])

            processed_clips.append(clip)
        except Exception as e:
            print(f"Error processing clip '{path}': {e}")

    if not processed_clips:
        return ColorClip(
            size=(FINAL_WIDTH, FINAL_HEIGHT),
            color=(10, 10, 10)
        ).with_duration(duration)

    scene_composite = CompositeVideoClip(
        processed_clips,
        size=(FINAL_WIDTH, FINAL_HEIGHT)
    ).with_duration(duration)

    return scene_composite


def match_scenes_to_audio(scenes, audio_words, audio_duration):
    """
    Synchronizes scene timings strictly to the chronological audio transcription.
    Preserves all scenes in their exact sequence, matching words spoken by the narrator.
    """
    total_scenes = len(scenes)
    if total_scenes == 0:
        return []

    # Map words to timestamps
    word_index = 0
    matched_anchors = []

    last_time = 0.0
    min_scene_gap = max(2.5, min(8.0, audio_duration / (total_scenes * 1.5)))

    for scene_idx, scene in enumerate(scenes):
        kw = clean_word(scene.get("keyword", ""))
        scene_txt = clean_word(scene.get("scene_text", ""))
        scene_tokens = set(scene_txt.split()) if scene_txt else set()
        if kw:
            scene_tokens.add(kw)

        found_time = None

        # Search forward in audio words starting from last_time + 1.0s
        for idx in range(word_index, len(audio_words)):
            w = audio_words[idx]
            if w["start"] < (last_time + 1.0):
                continue

            # Check if this word matches the scene keyword or key tokens
            if (kw and w["word"] == kw) or (w["word"] in scene_tokens and len(w["word"]) >= 4):
                found_time = w["start"]
                word_index = idx + 1
                break

        if found_time is not None and (found_time - last_time) >= min_scene_gap:
            matched_anchors.append({
                "scene_idx": scene_idx,
                "start": found_time
            })
            last_time = found_time

    # Ensure start (0.0) is anchored to scene 0
    scene_starts = [None] * total_scenes
    scene_starts[0] = 0.0

    for anchor in matched_anchors:
        scene_starts[anchor["scene_idx"]] = anchor["start"]

    # Interpolate missing scene timestamps smoothly
    last_known_idx = 0
    while last_known_idx < total_scenes - 1:
        # Find next known index
        next_known_idx = None
        for j in range(last_known_idx + 1, total_scenes):
            if scene_starts[j] is not None:
                next_known_idx = j
                break

        if next_known_idx is None:
            # Distribute remaining evenly up to audio_duration
            t_start = scene_starts[last_known_idx]
            t_end = audio_duration
            steps = total_scenes - last_known_idx
            step_duration = max(1.0, (t_end - t_start) / steps)
            for j in range(last_known_idx + 1, total_scenes):
                scene_starts[j] = t_start + (j - last_known_idx) * step_duration
            break
        else:
            t_start = scene_starts[last_known_idx]
            t_end = scene_starts[next_known_idx]
            steps = next_known_idx - last_known_idx
            step_duration = (t_end - t_start) / steps
            for j in range(last_known_idx + 1, next_known_idx):
                scene_starts[j] = t_start + (j - last_known_idx) * step_duration
            last_known_idx = next_known_idx

    # Build continuous timeline
    timeline = []
    for idx in range(total_scenes):
        start = scene_starts[idx]
        end = scene_starts[idx + 1] if idx + 1 < total_scenes else audio_duration
        if end > audio_duration:
            end = audio_duration
        dur = max(0.5, end - start)

        timeline.append({
            **scenes[idx],
            "start": start,
            "end": end,
            "duration": dur
        })

    # Ensure the last scene extends to full audio duration
    if timeline:
        timeline[-1]["end"] = audio_duration
        timeline[-1]["duration"] = audio_duration - timeline[-1]["start"]

    print(f"[LOG] Scene timeline synchronized with narration: {len(timeline)} scenes over {audio_duration:.2f}s.")
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

        print(f"\n[LOG] Processing scene {idx + 1}/{len(timeline)}: '{query}' ({duration:.2f}s, 3 clips)")
        
        # Download exactly 3 clips for this scene
        paths = get_scene_clip_paths(
            query=query,
            scene_index=idx + 1,
            clips_dir=clips_dir,
            keyword=keyword,
            video_subject=video_subject
        )

        scene_clip = create_scene_from_paths(paths, duration)
        final_clips.append(scene_clip)
        gc.collect()

    print("\n[LOG] Concatenating scenes with seamless transitions...")
    final_clips_with_fades = []
    scene_fade_dur = 0.35

    for idx, clip in enumerate(final_clips):
        effects = []
        if idx > 0:
            effects.append(vfx.FadeIn(scene_fade_dur))
        if idx < len(final_clips) - 1:
            effects.append(vfx.FadeOut(scene_fade_dur))
        if effects:
            clip = clip.with_effects(effects)
        final_clips_with_fades.append(clip)

    video = concatenate_videoclips(final_clips_with_fades, method="compose")
    if video.duration > audio_duration:
        video = video.subclipped(0, audio_duration)

    if use_subtitles:
        print("[LOG] Overlaying synchronized high-contrast subtitles...")
        subtitles = parse_srt_file(srt_path)
        subtitle_clips = []

        for sub in subtitles:
            sub_start = min(sub["start"], video.duration - 0.1)
            sub_end = min(sub["end"], video.duration)
            sub_dur = sub_end - sub_start
            if sub_dur <= 0.1:
                continue

            try:
                txt_clip = TextClip(
                    text=sub["text"],
                    font_size=44,
                    color="white",
                    stroke_color="black",
                    stroke_width=3,
                    method="caption",
                    size=(FINAL_WIDTH - 200, None),
                    text_align="center"
                ).with_start(sub_start).with_duration(sub_dur).with_position(
                    ("center", FINAL_HEIGHT - 120)
                )
                subtitle_clips.append(txt_clip)
            except Exception as e:
                print(f"Subtitle rendering error on '{sub['text']}': {e}")

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
        print(f"[LOG] Prepending intro video from '{intro_path}'...")
        try:
            intro_clip = VideoFileClip(intro_path)
            intro_clip = resize_crop(intro_clip)
            video = concatenate_videoclips([intro_clip, video], method="compose")
            print(f"[LOG] Intro video prepended successfully ({intro_clip.duration:.2f}s). Total duration: {video.duration:.2f}s")
        except Exception as e:
            print(f"[LOG] Warning: Failed to attach intro video: {e}")

    print(f"\n[LOG] Encoding and writing Full HD MP4 file to {output_path} ...")
    video.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="fast",
        bitrate="6000k",
        threads=2
    )
    print("[LOG] Video rendering completed successfully at Full HD 1080p.")
    
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
