import os
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_GOOG_LOG_SEVERITY_THRESHOLD"] = "3"

import sys
import json
import argparse
import wave
import traceback
import shutil
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import rss
import gemini
import piper_tts
import whisper
import movie
import shorts
import thumbnail

VIDEO_DIR = os.getenv("VIDEO_STORAGE_DIR", "../videos")
THUMBNAIL_DIR = os.getenv("THUMBNAIL_STORAGE_DIR", "../thumbnails")
LOG_DIR = os.getenv("LOG_STORAGE_DIR", "../logs")


def save_checkpoint(checkpoint_file, data):
    try:
        with open(checkpoint_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[LOG] Warning: Failed to write checkpoint: {e}")


def load_checkpoint(checkpoint_file):
    if os.path.exists(checkpoint_file):
        try:
            with open(checkpoint_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[LOG] Warning: Failed to read checkpoint: {e}")
    return {}


def main():
    parser = argparse.ArgumentParser(description="ByteWire AI Video Generation Engine Pipeline")
    parser.add_argument("--job-id", required=True, help="Unique MongoDB ID for the generation job")
    parser.add_argument("--subject", default="technology news", help="The topic of the news video")
    parser.add_argument("--language", default="english", help="Narration language (english)")
    parser.add_argument("--use-music", type=str, default="true", help="Toggle background music (true/false)")
    parser.add_argument("--use-subtitles", type=str, default="true", help="Toggle subtitle burn-in (true/false)")
    parser.add_argument("--custom-prompt", default="", help="Optional instructions/prompt for scriptwriter")
    parser.add_argument("--video-type", default="tech_news", help="Type of video: tech_news, trending_news, india_general_news, specific_content")
    parser.add_argument("--custom-script", default="", help="Direct script text if video-type is specific_content")
    parser.add_argument("--generate-shorts", type=str, default="true", help="Extract vertical 9:16 shorts (true/false)")
    parser.add_argument("--facts-count", type=int, default=10, help="Number of news facts in the full video (default: 10)")
    
    args = parser.parse_args()
    
    job_id = args.job_id
    subject = args.subject
    language = args.language.lower().strip()
    use_music = args.use_music.lower() == "true"
    use_subtitles = args.use_subtitles.lower() == "true"
    custom_prompt = args.custom_prompt
    video_type = args.video_type
    custom_script = args.custom_script
    generate_shorts = args.generate_shorts.lower() == "true"

    os.makedirs(VIDEO_DIR, exist_ok=True)
    os.makedirs(THUMBNAIL_DIR, exist_ok=True)

    scratch_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch", job_id)
    os.makedirs(scratch_dir, exist_ok=True)

    checkpoint_file = os.path.join(scratch_dir, "checkpoint.json")
    checkpoint = load_checkpoint(checkpoint_file)

    script_path = os.path.join(scratch_dir, "script.txt")
    scene_plan_path = os.path.join(scratch_dir, "scene_plan.json")
    voice_path = os.path.join(scratch_dir, "voice.wav")
    srt_path = os.path.join(scratch_dir, "voice.srt")
    words_path = os.path.join(scratch_dir, "words.json")
    timeline_path = os.path.join(scratch_dir, "timeline.json")
    music_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music.mp3")
    clips_dir = os.path.join(scratch_dir, "clips")
    os.makedirs(clips_dir, exist_ok=True)
    
    output_video_path = os.path.abspath(os.path.join(VIDEO_DIR, f"{job_id}.mp4"))
    output_thumbnail_path = os.path.abspath(os.path.join(THUMBNAIL_DIR, f"{job_id}.png"))

    try:
        # ======================================================================
        # STAGE 1: SCRIPT GENERATION / NEWS SELECTION
        # ======================================================================
        script_text = None
        if os.path.exists(script_path) and os.path.getsize(script_path) > 10:
            try:
                with open(script_path, "r", encoding="utf-8") as f:
                    script_text = f.read().strip()
                if script_text:
                    print("@STATUS: Generating Script")
                    print("@PROGRESS: 30")
                    print("[LOG] [CHECKPOINT RESUME] Reusing existing validated script from previous attempt.")
            except Exception as e:
                print(f"[LOG] Warning reading script checkpoint: {e}")

        if not script_text:
            if video_type == "specific_content":
                print("@STATUS: Generating Script")
                print("@PROGRESS: 30")
                print("[LOG] Using custom script content provided directly...")
                if not custom_script:
                    raise ValueError("Custom script content is required when video-type is 'specific_content'.")
                script_text = custom_script
            else:
                print("@STATUS: Collecting RSS", flush=True)
                print("@PROGRESS: 10", flush=True)
                print(f"[LOG] Querying verified high-tier RSS news feeds for '{video_type}'...", flush=True)
                candidate_items = rss.collect_news(video_type)
                if not candidate_items:
                    raise ValueError("No news stories collected from RSS feeds.")
                print(f"[LOG] Scraped {len(candidate_items)} fresh unique news stories across verified feeds.", flush=True)

                print("@STATUS: Selecting News", flush=True)
                print("@PROGRESS: 20", flush=True)
                facts_count = args.facts_count if (hasattr(args, "facts_count") and args.facts_count) else int(os.getenv("FACTS_PER_VIDEO", 10))
                if facts_count < 10 and not os.getenv("ALLOW_SHORT_FACTS_COUNT"):
                    print(f"[LOG] Enforcing full 10 news facts for broadcast video (overriding setting of {facts_count}).", flush=True)
                    facts_count = 10
                print(f"[LOG] Evaluating candidate stories with Gemini AI for Top {facts_count} High-CTR & viral appeal (Top 3 designated for Shorts)...", flush=True)
                top_stories = gemini.select_top_10_news(candidate_items, subject, video_type, count=facts_count)
                print(f"[LOG] Selected {len(top_stories)} top stories. Generating broadcast script...", flush=True)
                script_text = gemini.generate_script(top_stories, subject, language, custom_prompt)
                print(f"[LOG] News script written successfully by Gemini AI ({len(top_stories)} stories included).", flush=True)

            with open(script_path, "w", encoding="utf-8") as f:
                f.write(script_text)
            checkpoint["has_script"] = True
            save_checkpoint(checkpoint_file, checkpoint)

        safe_script_log = script_text.replace("\n", "\\n")
        print(f"@SCRIPT: {safe_script_log}")

        # ======================================================================
        # STAGE 2: SCENE PLAN (Visual queries and keywords)
        # ======================================================================
        scenes = None
        if os.path.exists(scene_plan_path) and os.path.getsize(scene_plan_path) > 10:
            try:
                with open(scene_plan_path, "r", encoding="utf-8") as f:
                    scene_plan_data = json.load(f)
                    scenes = scene_plan_data.get("scenes", [])
                if scenes:
                    print("[LOG] [CHECKPOINT RESUME] Reusing existing visual scene plan.")
            except Exception as e:
                print(f"[LOG] Warning reading scene plan checkpoint: {e}")

        if not scenes:
            print("@STATUS: Generating Script")
            print("@PROGRESS: 30")
            print("[LOG] Running Gemini AI to plan visual queries and keywords...")
            scene_plan = gemini.generate_scene_plan(script_text)
            scenes = scene_plan.get("scenes", [])
            if not scenes:
                raise ValueError("Gemini failed to generate a scene plan timeline.")
            with open(scene_plan_path, "w", encoding="utf-8") as f:
                json.dump(scene_plan, f, indent=2)
            checkpoint["has_scene_plan"] = True
            save_checkpoint(checkpoint_file, checkpoint)

        print(f"[LOG] Visual scene plan loaded: {len(scenes)} scenes planned.")
        for idx, s in enumerate(scenes, 1):
            print(f"[LOG] Scene {idx}: keyword='{s.get('keyword', '')}' | query='{s.get('search_query', '')}'")

        # ======================================================================
        # STAGE 3: VOICE SYNTHESIS (Piper TTS)
        # ======================================================================
        voice_ready = os.path.exists(voice_path) and os.path.getsize(voice_path) > 20000
        if voice_ready:
            print("@STATUS: Generating Voice")
            print("@PROGRESS: 45")
            print("[LOG] [CHECKPOINT RESUME] Reusing synthesized voiceover audio from previous attempt.")
        else:
            print("@STATUS: Generating Voice")
            print("@PROGRESS: 45")
            print(f"[LOG] Starting text-to-speech audio synthesis (Language: {language})...")
            piper_tts.generate_audio(script_text, voice_path, language)
            checkpoint["has_voice"] = True
            save_checkpoint(checkpoint_file, checkpoint)

        with wave.open(voice_path, "rb") as wf:
            audio_duration = wf.getnframes() / float(wf.getframerate())
        print(f"@DURATION: {audio_duration}")
        print(f"[LOG] Voiceover narration validated. Duration: {audio_duration:.2f} seconds.")

        # ======================================================================
        # STAGE 4: SUBTITLES & WORD TIMESTAMPS (Faster-Whisper)
        # ======================================================================
        audio_words = None
        srt_ready = os.path.exists(srt_path) and os.path.getsize(srt_path) > 20
        words_ready = os.path.exists(words_path) and os.path.getsize(words_path) > 20

        if srt_ready and words_ready:
            try:
                with open(words_path, "r", encoding="utf-8") as f:
                    audio_words = json.load(f)
                print("@STATUS: Generating Subtitles")
                print("@PROGRESS: 60")
                print("[LOG] [CHECKPOINT RESUME] Reusing existing Faster-Whisper subtitles and word timestamps.")
            except Exception as e:
                print(f"[LOG] Warning reading words checkpoint: {e}")
                audio_words = None

        if audio_words is None:
            print("@STATUS: Generating Subtitles")
            print("@PROGRESS: 60")
            print("[LOG] Transcribing audio with Faster-Whisper to generate subtitles and timestamps...")
            audio_words = whisper.transcribe_and_generate_srt(voice_path, srt_path)
            with open(words_path, "w", encoding="utf-8") as f:
                json.dump(audio_words, f, indent=2)
            checkpoint["has_subtitles"] = True
            save_checkpoint(checkpoint_file, checkpoint)
            print("[LOG] Subtitles SRT and word timestamps generated.")

        # ======================================================================
        # STAGE 5: TIMELINE ALIGNMENT & CLIP FOOTAGE
        # ======================================================================
        timeline = None
        if os.path.exists(timeline_path) and os.path.getsize(timeline_path) > 10:
            try:
                with open(timeline_path, "r", encoding="utf-8") as f:
                    timeline = json.load(f)
                print("[LOG] [CHECKPOINT RESUME] Reusing existing synchronized scene timeline.")
            except Exception as e:
                print(f"[LOG] Warning reading timeline checkpoint: {e}")
                timeline = None

        if not timeline:
            print("@STATUS: Downloading Clips")
            print("@PROGRESS: 70")
            print("[LOG] Aligning scene plan to audio word timestamps...")
            timeline = movie.match_scenes_to_audio(scenes, audio_words, audio_duration)
            with open(timeline_path, "w", encoding="utf-8") as f:
                json.dump(timeline, f, indent=2)
            checkpoint["has_timeline"] = True
            save_checkpoint(checkpoint_file, checkpoint)
            print("[LOG] Matched timeline created and saved.")

        print("@STATUS: Downloading Clips")
        print("@PROGRESS: 70")
        print(f"[LOG] Storing clips in {clips_dir} (download_video skips previously downloaded clips)")

        # ======================================================================
        # STAGE 6: RENDERING & MOVIEPY COMPILATION
        # ======================================================================
        print("@STATUS: Rendering")
        print("@PROGRESS: 85")
        print("[LOG] Launching MoviePy editor to compile final video overlaying voice, subtitles, and music...")
        
        intro_path = os.getenv("INTRO_FILE_PATH")
        if not intro_path or not os.path.exists(intro_path):
            candidates = [
                os.path.join(os.path.dirname(__file__), "..", "..", "intro.mp4"),
                os.path.join(os.path.dirname(__file__), "..", "intro.mp4"),
                os.path.join(os.path.dirname(__file__), "intro.mp4"),
                "intro.mp4"
            ]
            for c in candidates:
                if os.path.exists(c):
                    intro_path = os.path.abspath(c)
                    break

        if intro_path and os.path.exists(intro_path):
            print(f"[LOG] Using intro video: {intro_path}")
        else:
            intro_path = None

        movie.compile_video(
            timeline=timeline,
            clips_dir=clips_dir,
            voice_path=voice_path,
            srt_path=srt_path,
            music_path=music_path,
            output_path=output_video_path,
            use_music=use_music,
            use_subtitles=use_subtitles,
            video_subject=subject,
            intro_path=intro_path,
            scratch_dir=scratch_dir
        )

        intro_offset = movie.get_video_duration(intro_path) if (intro_path and os.path.exists(intro_path)) else 0.0

        # ======================================================================
        # STAGE 7: YOUTUBE METADATA & PROFESSIONAL THUMBNAIL CREATION
        # ======================================================================
        print("[LOG] Parsing all 10 fact chapters and detecting timestamps for video timeline and metadata...")
        facts_parsed = shorts.parse_facts_from_script(script_text)
        fact_segments = shorts.detect_fact_timestamps(facts_parsed, audio_words, audio_duration + intro_offset, intro_offset)

        # Output fact segments for backend storage (all 10 facts)
        safe_facts_json = json.dumps(fact_segments).replace("\n", " ")
        print(f"@FACTS: {safe_facts_json}", flush=True)

        # Generate Full Video YouTube Metadata in 1 single Gemini API call with all 10 chapters
        print("@STATUS: Generating Metadata", flush=True)
        yt_meta = {}
        try:
            yt_meta = gemini.generate_video_metadata(subject, script_text, fact_segments, language)
            safe_meta_json = json.dumps(yt_meta).replace("\n", " ")
            print(f"@METADATA: {safe_meta_json}", flush=True)
        except Exception as e:
            print(f"[LOG] Warning generating YouTube metadata: {e}", flush=True)

        # Generate High-Impact YouTube Thumbnail (gathered from Pexels high-res photos + viral graphic overlays)
        print("[LOG] Generating high-CTR professional YouTube thumbnail gathered from Pexels...", flush=True)
        try:
            hook_text = yt_meta.get("thumbnail_hook", "") if isinstance(yt_meta, dict) else ""
            meta_title = yt_meta.get("title", "") if isinstance(yt_meta, dict) else ""
            thumbnail.create_youtube_thumbnail(
                output_path=output_thumbnail_path,
                title=meta_title,
                hook_text=hook_text,
                facts=fact_segments,
                subject=subject,
                video_path=output_video_path,
                intro_offset=intro_offset
            )
        except Exception as e:
            print(f"[LOG] Warning in custom thumbnail generator: {e}. Falling back to video frame.", flush=True)
            movie.generate_thumbnail(output_video_path, output_thumbnail_path, timestamp_sec=max(1.0, intro_offset + 3.0))

        # ======================================================================
        # STAGE 8: 9:16 SHORTS EXTRACTION
        # ======================================================================

        # Extract vertical 9:16 shorts if requested (strictly top 3 shorts from the 10 news)
        if generate_shorts:
            print("@STATUS: Generating Shorts", flush=True)
            print("@PROGRESS: 92", flush=True)
            print("[LOG] Extracting top 3 vertical 9:16 Shorts from the 10 news stories and generating dedicated metadata in 1 request...", flush=True)
            try:
                shorts_result = shorts.extract_all_shorts(
                    job_id=job_id,
                    video_path=output_video_path,
                    script_text=script_text,
                    audio_words=audio_words,
                    intro_offset=intro_offset,
                    subject=subject,
                    language=language,
                    video_storage_dir=VIDEO_DIR,
                    thumbnail_storage_dir=THUMBNAIL_DIR,
                    existing_facts=fact_segments
                )
                safe_shorts_json = json.dumps(shorts_result.get("shorts", [])).replace("\n", " ")
                print(f"@SHORTS: {safe_shorts_json}", flush=True)
                print(f"[LOG] Sliced {len(shorts_result.get('shorts', []))} vertical 9:16 shorts successfully.", flush=True)
            except Exception as e:
                print(f"[LOG] Warning generating shorts: {e}", flush=True)

        # Clean scratch folder only upon 100% successful completion
        print("[LOG] Cleaning up scratch rendering files...")
        try:
            shutil.rmtree(scratch_dir)
        except Exception as e:
            print(f"[LOG] Warning: Failed to clean up temp scratch folder: {e}")

        print("@STATUS: Completed")
        print("@PROGRESS: 100")
        print(f"[LOG] Generation complete! Video file: {output_video_path}")
        sys.exit(0)

    except Exception as err:
        print(f"@ERROR: {str(err)}")
        print("@STATUS: Failed")
        print("[LOG] Generating Stack Trace:")
        traceback.print_exc()
        print(f"[LOG] [CHECKPOINT PRESERVED] Temporary assets preserved in {scratch_dir}. Clicking 'Retry Pipeline' will resume from this point.")
        sys.exit(1)


if __name__ == "__main__":
    main()
