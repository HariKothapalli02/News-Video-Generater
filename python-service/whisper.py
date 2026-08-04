import os
import re
from dotenv import load_dotenv
from faster_whisper import WhisperModel

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "small")


def format_srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def transcribe_and_generate_srt(audio_path, srt_path):
    print(f"Loading Whisper model '{WHISPER_MODEL_NAME}' on CPU...")
    model = WhisperModel(
        WHISPER_MODEL_NAME,
        device="cpu",
        compute_type="int8"
    )

    print(f"Transcribing audio file: {audio_path}")
    segments, info = model.transcribe(
        audio_path,
        word_timestamps=True
    )

    audio_words = []
    
    print(f"Writing subtitles to: {srt_path}")
    with open(srt_path, "w", encoding="utf-8") as f:
        for idx, segment in enumerate(segments, 1):
            start_str = format_srt_time(segment.start)
            end_str = format_srt_time(segment.end)
            
            f.write(f"{idx}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{segment.text.strip()}\n\n")
            
            if segment.words:
                for word in segment.words:
                    cleaned = re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", word.word.lower()).strip()
                    if cleaned:
                        audio_words.append({
                            "word": cleaned,
                            "start": float(word.start),
                            "end": float(word.end)
                        })

    print(f"Transcription complete. Transcribed {len(audio_words)} words.")
    return audio_words
