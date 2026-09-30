import os
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_GOOG_LOG_SEVERITY_THRESHOLD"] = "3"

import sys
import argparse
import wave
import traceback
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import rss
import gemini
import piper_tts
import whisper
import movie

VIDEO_DIR = os.getenv("VIDEO_STORAGE_DIR", "../videos")
THUMBNAIL_DIR = os.getenv("THUMBNAIL_STORAGE_DIR", "../thumbnails")
LOG_DIR = os.getenv("LOG_STORAGE_DIR", "../logs")


def main():
    parser = argparse.ArgumentParser(description="ByteWire AI Video Generation Engine Pipeline")
    parser.add_argument("--job-id", required=True, help="Unique MongoDB ID for the generation job")
    parser.add_argument("--subject", default="technology news", help="The topic of the news video")
    parser.add_argument("--language", default="english", help="Narration language (english)")
    parser.add_argument("--use-music", type=str, default="true", help="Toggle background music (true/false)")
    parser.add_argument("--use-subtitles", type=str, default="true", help="Toggle subtitle burn-in (true/false)")
    parser.add_argument("--custom-prompt", default="", help="Optional instructions/prompt for scriptwriter")
    parser.add_argument("--video-type", default="tech_news", help="Type of video: tech_news, trending_news, specific_content")
    parser.add_argument("--custom-script", default="", help="Direct script text if video-type is specific_content")
    
    args = parser.parse_args()
    
    job_id = args.job_id
    subject = args.subject
    language = args.language.lower().strip()
    use_music = args.use_music.lower() == "true"
    use_subtitles = args.use_subtitles.lower() == "true"
    custom_prompt = args.custom_prompt
    video_type = args.video_type
    custom_script = args.custom_script

    os.makedirs(VIDEO_DIR, exist_ok=True)
    os.makedirs(THUMBNAIL_DIR, exist_ok=True)

    scratch_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch", job_id)
    os.makedirs(scratch_dir, exist_ok=True)

    voice_path = os.path.join(scratch_dir, "voice.wav")
    srt_path = os.path.join(scratch_dir, "voice.srt")
    music_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music.mp3")
    clips_dir = os.path.join(scratch_dir, "clips")
    
    output_video_path = os.path.abspath(os.path.join(VIDEO_DIR, f"{job_id}.mp4"))
    output_thumbnail_path = os.path.abspath(os.path.join(THUMBNAIL_DIR, f"{job_id}.png"))

    try:
        if video_type == "specific_content":
            print("@STATUS: Generating Script")
            print("@PROGRESS: 30")
            print("[LOG] Using custom script content provided directly...")
            if not custom_script:
                raise ValueError("Custom script content is required when video-type is 'specific_content'.")
            script_text = custom_script
        else:
            print("@STATUS: Collecting RSS")
            print("@PROGRESS: 10")
            print("[LOG] Collecting recent articles from RSS feeds...")
            news_items = rss.collect_news(video_type)
            if not news_items:
                raise ValueError("No news stories collected from RSS feeds.")
            print(f"[LOG] Scraped and scored {len(news_items)} stories successfully.")

            print("@STATUS: Selecting News")
            print("@PROGRESS: 20")
            print("[LOG] Running Gemini AI to select top 10 stories and generate video script...")
            script_text = gemini.generate_script(news_items, subject, language, custom_prompt)
        
        safe_script_log = script_text.replace("\n", "\\n")
        print(f"@SCRIPT: {safe_script_log}")
        
        print("@STATUS: Generating Script")
        print("@PROGRESS: 30")
        print("[LOG] Running Gemini AI to plan visual queries and keywords...")
        scene_plan = gemini.generate_scene_plan(script_text)
        scenes = scene_plan.get("scenes", [])
        video_context = scene_plan.get("video_context", "cinematic compilation")
        if not scenes:
            raise ValueError("Gemini failed to generate a scene plan timeline.")
        print(f"[LOG] Visual scene plan generated: {len(scenes)} scenes planned.")
        for idx, s in enumerate(scenes, 1):
            print(f"[LOG] Scene {idx}: keyword='{s['keyword']}' | query='{s['search_query']}'")

        print("@STATUS: Generating Voice")
        print("@PROGRESS: 45")
        print(f"[LOG] Starting text-to-speech audio synthesis (Language: {language})...")
        piper_tts.generate_audio(script_text, voice_path, language)
        
        with wave.open(voice_path, "rb") as wf:
            audio_duration = wf.getnframes() / float(wf.getframerate())
        print(f"@DURATION: {audio_duration}")
        print(f"[LOG] Voiceover narration synthesized successfully. Duration: {audio_duration:.2f} seconds.")

        print("@STATUS: Generating Subtitles")
        print("@PROGRESS: 60")
        print("[LOG] Transcribing audio with Faster-Whisper to generate subtitles and timestamps...")
        audio_words = whisper.transcribe_and_generate_srt(voice_path, srt_path)
        print("[LOG] Subtitles SRT file generated.")

        print("@STATUS: Downloading Clips")
        print("@PROGRESS: 70")
        print("[LOG] Aligning scene plan to audio word timestamps...")
        timeline = movie.match_scenes_to_audio(scenes, audio_words, audio_duration)
        print("[LOG] Matched timeline created.")
        
        print(f"[LOG] Storing clips in {clips_dir}")
        
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
            intro_path=intro_path
        )

        print("[LOG] Extracting video thumbnail frame...")
        movie.generate_thumbnail(output_video_path, output_thumbnail_path)

        print("[LOG] Cleaning up temporary rendering files...")
        try:
            import shutil
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
        sys.exit(1)


if __name__ == "__main__":
    main()
