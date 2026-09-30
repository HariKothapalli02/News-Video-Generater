import os
import math
import re
import random
import requests
import shutil
import subprocess
import gc
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


def get_ffmpeg_exe():
    """
    Locates the most reliable FFmpeg executable available:
    1. System PATH 'ffmpeg'
    2. imageio-ffmpeg bundled binary
    """
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


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


def render_single_scene_to_file(paths, duration, output_path):
    """
    Renders exactly 3 clips into a single standalone scene MP4 file
    with crossfade transitions, then immediately frees all video decoders
    and frame buffers from memory.
    """
    if os.path.exists(output_path) and os.path.getsize(output_path) > 30000:
        return output_path

    valid_paths = [p for p in (paths or []) if os.path.exists(p) and os.path.getsize(p) > 10000]
    num_clips = len(valid_paths)

    if num_clips == 0:
        # Fallback dark background clip
        blank = ColorClip(
            size=(FINAL_WIDTH, FINAL_HEIGHT),
            color=(15, 20, 30)
        ).with_duration(duration)
        blank.write_videofile(
            output_path,
            fps=FPS,
            codec="libx264",
            preset="ultrafast",
            audio=False,
            threads=2,
            logger=None
        )
        blank.close()
        gc.collect()
        return output_path

    transition_dur = min(0.35, duration / (num_clips * 2.5)) if num_clips > 1 else 0.0
    effective_slot = (duration + (num_clips - 1) * transition_dur) / num_clips

    raw_clips = []
    processed_clips = []

    for idx, path in enumerate(valid_paths):
        try:
            raw_clip = VideoFileClip(path).without_audio()
            raw_clips.append(raw_clip)
            clip = resize_crop(raw_clip)

            if clip.duration < effective_slot:
                repeat_count = math.ceil(effective_slot / max(0.1, clip.duration))
                clip = concatenate_videoclips([clip] * repeat_count)

            clip = clip.subclipped(0, effective_slot)
            start_time = idx * (effective_slot - transition_dur)
            clip = clip.with_start(start_time)

            if idx > 0 and transition_dur > 0.05:
                clip = clip.with_effects([vfx.CrossFadeIn(transition_dur)])

            processed_clips.append(clip)
        except Exception as e:
            print(f"[LOG] Warning processing clip '{path}': {e}")

    if not processed_clips:
        scene_composite = ColorClip(
            size=(FINAL_WIDTH, FINAL_HEIGHT),
            color=(15, 20, 30)
        ).with_duration(duration)
    else:
        scene_composite = CompositeVideoClip(
            processed_clips,
            size=(FINAL_WIDTH, FINAL_HEIGHT)
        ).with_duration(duration)

    # Encode single scene to MP4
    scene_composite.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        preset="ultrafast",
        audio=False,
        threads=2,
        logger=None
    )

    # Strict resource reclamation
    try:
        scene_composite.close()
    except Exception:
        pass
    for c in processed_clips:
        try:
            c.close()
        except Exception:
            pass
    for r in raw_clips:
        try:
            r.close()
        except Exception:
            pass

    del raw_clips, processed_clips, scene_composite
    gc.collect()
    return output_path


def match_scenes_to_audio(scenes, audio_words, audio_duration):
    """
    Synchronizes scene timings strictly to the chronological audio transcription.
    Preserves all scenes in their exact sequence, matching words spoken by the narrator.
    """
    total_scenes = len(scenes)
    if total_scenes == 0:
        return []

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

        for idx in range(word_index, len(audio_words)):
            w = audio_words[idx]
            if w["start"] < (last_time + 1.0):
                continue

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

    scene_starts = [None] * total_scenes
    scene_starts[0] = 0.0

    for anchor in matched_anchors:
        scene_starts[anchor["scene_idx"]] = anchor["start"]

    last_known_idx = 0
    while last_known_idx < total_scenes - 1:
        next_known_idx = None
        for j in range(last_known_idx + 1, total_scenes):
            if scene_starts[j] is not None:
                next_known_idx = j
                break

        if next_known_idx is None:
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

    if timeline:
        timeline[-1]["end"] = audio_duration
        timeline[-1]["duration"] = audio_duration - timeline[-1]["start"]

    print(f"[LOG] Scene timeline synchronized with narration: {len(timeline)} scenes over {audio_duration:.2f}s.")
    return timeline


def prepare_intro_scene(intro_path, intro_output_path):
    """
    Standardizes user-provided intro video to 1920x1080 30fps MP4 without audio.
    """
    if os.path.exists(intro_output_path) and os.path.getsize(intro_output_path) > 30000:
        return intro_output_path

    try:
        raw_clip = VideoFileClip(intro_path).without_audio()
        clip = resize_crop(raw_clip)
        clip.write_videofile(
            intro_output_path,
            fps=FPS,
            codec="libx264",
            preset="ultrafast",
            audio=False,
            threads=2,
            logger=None
        )
        clip.close()
        raw_clip.close()
        del raw_clip, clip
        gc.collect()
        return intro_output_path
    except Exception as e:
        print(f"[LOG] Warning: Failed to prepare intro scene: {e}")
        return None


def concatenate_scene_files(scene_files, output_file, ffmpeg_exe=None):
    """
    Concatenates individual scene MP4s. Uses FFmpeg concat demuxer
    (lossless, takes ~1 second, consumes <15MB RAM). Falls back to
    MoviePy sequential chain streaming if necessary.
    """
    if not scene_files:
        raise ValueError("No scene files provided to concatenate.")

    if len(scene_files) == 1:
        shutil.copyfile(scene_files[0], output_file)
        return output_file

    if not ffmpeg_exe:
        ffmpeg_exe = get_ffmpeg_exe()

    concat_list_path = output_file + ".concat_list.txt"
    try:
        with open(concat_list_path, "w", encoding="utf-8") as f:
            for sf in scene_files:
                normalized = os.path.abspath(sf).replace("\\", "/")
                f.write(f"file '{normalized}'\n")

        cmd = [
            ffmpeg_exe, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-c", "copy",
            "-movflags", "+faststart",
            output_file
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(output_file) and os.path.getsize(output_file) > 10000:
            print("[LOG] Scenes concatenated seamlessly via FFmpeg stream copy.")
            return output_file
        else:
            print(f"[LOG] Notice: FFmpeg concat demuxer returned code {res.returncode}. Using fallback stream...")
    except Exception as e:
        print(f"[LOG] Notice: FFmpeg concat attempt: {e}. Using fallback...")
    finally:
        if os.path.exists(concat_list_path):
            try:
                os.remove(concat_list_path)
            except Exception:
                pass

    # MoviePy Fallback with method="chain" (sequential stream)
    print("[LOG] Concatenating scenes via MoviePy sequential stream...")
    clips = []
    for sf in scene_files:
        try:
            clips.append(VideoFileClip(sf))
        except Exception as e:
            print(f"[LOG] Warning opening scene file '{sf}': {e}")

    if not clips:
        raise ValueError("Failed to load any scene clips for concatenation.")

    final_video = concatenate_videoclips(clips, method="chain")
    final_video.write_videofile(
        output_file,
        fps=FPS,
        codec="libx264",
        preset="fast",
        audio=False,
        threads=2,
        logger=None
    )
    final_video.close()
    for c in clips:
        try:
            c.close()
        except Exception:
            pass
    del clips, final_video
    gc.collect()
    return output_file


def apply_audio_and_subtitles(
    video_path,
    voice_path,
    srt_path,
    music_path,
    output_path,
    audio_duration,
    use_music=True,
    use_subtitles=True,
    ffmpeg_exe=None
):
    """
    Mixes voiceover audio, background music, and burns in broadcast-quality
    subtitles in a single FFmpeg pass with minimal memory overhead (<150MB).
    Falls back gracefully if any optional filter encounters an issue.
    """
    if not ffmpeg_exe:
        ffmpeg_exe = get_ffmpeg_exe()

    work_dir = os.path.dirname(output_path)
    has_music = use_music and os.path.exists(music_path) and os.path.getsize(music_path) > 10000
    has_subtitles = use_subtitles and os.path.exists(srt_path) and os.path.getsize(srt_path) > 10

    # Copy srt into working directory to avoid OS path escaping issues in FFmpeg filter
    local_srt_name = "burn_subtitles.srt"
    local_srt_path = os.path.join(work_dir, local_srt_name)
    if has_subtitles:
        try:
            shutil.copyfile(srt_path, local_srt_path)
        except Exception as e:
            print(f"[LOG] Warning copying srt for filter: {e}")
            has_subtitles = False

    # Define subtitle styling: Arial, bold, white text, black outline & shadow, bottom center
    sub_style = (
        "Fontname=Arial,"
        "FontSize=22,"
        "Bold=1,"
        "PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,"
        "BorderStyle=1,"
        "Outline=2,"
        "Shadow=1,"
        "Alignment=2,"
        "MarginV=35"
    )

    # Build inputs and filtergraph
    inputs = ["-i", os.path.abspath(video_path), "-i", os.path.abspath(voice_path)]
    if has_music:
        inputs.extend(["-stream_loop", "-1", "-i", os.path.abspath(music_path)])

    filter_complex_parts = []
    map_video = "0:v"
    map_audio = "1:a"

    if has_subtitles:
        # Use relative filename with cwd=work_dir for foolproof multiplatform compatibility
        filter_complex_parts.append(f"[0:v]subtitles={local_srt_name}:force_style='{sub_style}'[vout]")
        map_video = "[vout]"

    if has_music:
        # Mix background music (6% volume) with voiceover (100% volume)
        filter_complex_parts.append("[2:a]volume=0.06[music];[1:a]volume=1.0[voice];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]")
        map_audio = "[aout]"

    cmd = [ffmpeg_exe, "-y"] + inputs

    if filter_complex_parts:
        cmd.extend(["-filter_complex", ";".join(filter_complex_parts)])

    cmd.extend([
        "-map", map_video,
        "-map", map_audio,
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-b:v", "6000k",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", f"{audio_duration:.2f}",
        os.path.abspath(output_path)
    ])

    print("[LOG] Encoding broadcast Full HD MP4 with synchronized audio and subtitles...")
    res = subprocess.run(cmd, cwd=work_dir, capture_output=True, text=True)

    # Clean local temp srt
    if os.path.exists(local_srt_path):
        try:
            os.remove(local_srt_path)
        except Exception:
            pass

    if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 50000:
        print("[LOG] Video rendering completed successfully at Full HD 1080p.")
        return output_path

    # If subtitle filter had an issue (e.g., missing libass in minimal builds), retry without subtitles
    if has_subtitles:
        print(f"[LOG] FFmpeg with subtitles had notice: {res.stderr[:200] if res.stderr else ''}. Retrying without hardcoded subtitles...")
        return apply_audio_and_subtitles(
            video_path=video_path,
            voice_path=voice_path,
            srt_path=srt_path,
            music_path=music_path,
            output_path=output_path,
            audio_duration=audio_duration,
            use_music=use_music,
            use_subtitles=False,
            ffmpeg_exe=ffmpeg_exe
        )

    # Fallback to MoviePy if FFmpeg execution fails entirely
    print(f"[LOG] FFmpeg mixing failed with code {res.returncode}. Executing MoviePy fallback...")
    return moviepy_final_fallback(
        video_path=video_path,
        voice_path=voice_path,
        srt_path=srt_path,
        music_path=music_path,
        output_path=output_path,
        audio_duration=audio_duration,
        use_music=use_music,
        use_subtitles=use_subtitles
    )


def moviepy_final_fallback(video_path, voice_path, srt_path, music_path, output_path, audio_duration, use_music=True, use_subtitles=False):
    """
    Reliable MoviePy fallback for final audio mixing.
    """
    video = VideoFileClip(video_path)
    voice_audio = AudioFileClip(voice_path)

    if use_music and os.path.exists(music_path):
        try:
            music = AudioFileClip(music_path)
            if music.duration < audio_duration:
                repeat = math.ceil(audio_duration / max(0.1, music.duration))
                music = concatenate_videoclips([music] * repeat)
            music = music.subclipped(0, audio_duration).with_volume_scaled(0.06)
            voice_audio = voice_audio.with_volume_scaled(1.0)
            final_audio = CompositeAudioClip([music, voice_audio])
        except Exception:
            final_audio = voice_audio
    else:
        final_audio = voice_audio

    video = video.with_audio(final_audio)
    if video.duration > audio_duration:
        video = video.subclipped(0, audio_duration)

    video.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="fast",
        bitrate="5000k",
        threads=2
    )

    video.close()
    voice_audio.close()
    gc.collect()
    return output_path


def generate_thumbnail(video_path, thumbnail_path):
    print(f"[LOG] Generating thumbnail at 3.0s: {thumbnail_path}")
    ffmpeg_exe = get_ffmpeg_exe()
    try:
        cmd = [
            ffmpeg_exe, "-y",
            "-ss", "00:00:03",
            "-i", os.path.abspath(video_path),
            "-vframes", "1",
            "-q:v", "2",
            os.path.abspath(thumbnail_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 1000:
            print("[LOG] Thumbnail generated successfully via FFmpeg.")
            return True
    except Exception:
        pass

    # MoviePy Fallback
    try:
        clip = VideoFileClip(video_path)
        clip.save_frame(thumbnail_path, t=min(3.0, clip.duration - 0.1))
        clip.close()
        gc.collect()
        print("[LOG] Thumbnail generated successfully via MoviePy.")
        return True
    except Exception as e:
        print(f"[LOG] Warning: Failed to generate thumbnail: {e}")
        return False


def compile_video(
    timeline,
    clips_dir,
    voice_path,
    srt_path,
    music_path,
    output_path,
    use_music=True,
    use_subtitles=True,
    video_subject="",
    intro_path=None,
    scratch_dir=None
):
    """
    Main Compilation Entry Point:
    1. Pre-renders each scene individually to disk in scratch/scenes (zero memory accumulation).
    2. Resumes previously rendered scenes instantly from checkpoints.
    3. Seamlessly concatenates all scene MP4s using FFmpeg concat stream.
    4. Mixes voiceover, music, and subtitles in a single low-memory pass.
    """
    from pexels import get_scene_clip_paths

    if not scratch_dir:
        scratch_dir = os.path.dirname(clips_dir)

    scenes_dir = os.path.join(scratch_dir, "scenes")
    os.makedirs(scenes_dir, exist_ok=True)

    # Narration duration check
    voice_audio = AudioFileClip(voice_path)
    audio_duration = voice_audio.duration
    voice_audio.close()
    del voice_audio
    gc.collect()

    print(f"Loading narration audio... Duration: {audio_duration:.2f}s")

    # Download default music if requested but missing
    if use_music and not os.path.exists(music_path):
        download_default_music(music_path)

    # 1. Process and Render Each Scene Individually to Disk
    rendered_scene_files = []
    total_scenes = len(timeline)

    for idx, item in enumerate(timeline):
        query = item["search_query"]
        duration = item["duration"]
        keyword = item.get("keyword", "")
        scene_output = os.path.join(scenes_dir, f"scene_{idx:03d}.mp4")

        # Dynamic progress reporting from 70% to 88%
        current_progress = 70 + int(((idx + 1) / total_scenes) * 18)
        print(f"@PROGRESS: {current_progress}", flush=True)

        if os.path.exists(scene_output) and os.path.getsize(scene_output) > 30000:
            print(f"[LOG] [CHECKPOINT RESUME] Scene {idx + 1}/{total_scenes} already rendered. Reusing.")
            rendered_scene_files.append(scene_output)
            continue

        print(f"\n[LOG] Processing scene {idx + 1}/{total_scenes}: '{query}' ({duration:.2f}s, 3 clips)")

        # Download clips for this scene
        paths = get_scene_clip_paths(
            query=query,
            scene_index=idx + 1,
            clips_dir=clips_dir,
            keyword=keyword,
            video_subject=video_subject
        )

        # Render this scene to isolated MP4 file
        rendered_path = render_single_scene_to_file(paths, duration, scene_output)
        rendered_scene_files.append(rendered_path)
        print(f"[LOG] Scene {idx + 1} rendered to disk successfully.")

    # 2. Intro Video (Optional)
    all_video_files = []
    if intro_path and os.path.exists(intro_path):
        print(f"[LOG] Prepending intro video from '{intro_path}'...")
        intro_scene_path = os.path.join(scenes_dir, "scene_intro.mp4")
        prep_intro = prepare_intro_scene(intro_path, intro_scene_path)
        if prep_intro:
            all_video_files.append(prep_intro)

    all_video_files.extend(rendered_scene_files)

    # 3. Concatenate Scene Files
    print("\n[LOG] Joining scenes into full video timeline...")
    print("@PROGRESS: 90", flush=True)
    concatenated_raw_video = os.path.join(scratch_dir, "scenes_combined_raw.mp4")
    concatenate_scene_files(all_video_files, concatenated_raw_video)

    # 4. Burn Subtitles and Mix Audio
    print("@PROGRESS: 93", flush=True)
    apply_audio_and_subtitles(
        video_path=concatenated_raw_video,
        voice_path=voice_path,
        srt_path=srt_path,
        music_path=music_path,
        output_path=output_path,
        audio_duration=audio_duration,
        use_music=use_music,
        use_subtitles=use_subtitles
    )

    print("@PROGRESS: 98", flush=True)
