import os
import re
from dotenv import load_dotenv
import av

# Fix compatibility between newer PyAV (>=14.0.0) and faster-whisper's audio loader
_orig_av_open = av.open
def _compat_av_open(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _orig_av_open(*args, **kwargs)
av.open = _compat_av_open

from faster_whisper import WhisperModel

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "base")


def format_srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def transcribe_and_generate_srt(audio_path, srt_path):
    import gc
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
    srt_entries = []
    entry_idx = 1
    
    for segment in segments:
        words = list(segment.words) if segment.words else []
        
        if words:
            for w in words:
                cleaned = re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", w.word.lower()).strip()
                if cleaned:
                    audio_words.append({
                        "word": cleaned,
                        "start": float(w.start),
                        "end": float(w.end)
                    })
            
            # Chunk words into concise subtitle lines of 4 to 6 words (max 38 characters)
            current_chunk = []
            chunk_char_len = 0
            
            for w in words:
                current_chunk.append(w)
                chunk_char_len += len(w.word) + 1
                
                if len(current_chunk) >= 5 or chunk_char_len >= 32 or w.word.endswith((".", "!", "?", ",")):
                    c_start = current_chunk[0].start
                    c_end = current_chunk[-1].end
                    c_text = " ".join([item.word.strip() for item in current_chunk if item.word.strip()])
                    if c_text and (c_end > c_start):
                        srt_entries.append((entry_idx, c_start, c_end, c_text))
                        entry_idx += 1
                    current_chunk = []
                    chunk_char_len = 0
            
            if current_chunk:
                c_start = current_chunk[0].start
                c_end = current_chunk[-1].end
                c_text = " ".join([item.word.strip() for item in current_chunk if item.word.strip()])
                if c_text and (c_end > c_start):
                    srt_entries.append((entry_idx, c_start, c_end, c_text))
                    entry_idx += 1
        else:
            # Fallback to segment text if words not provided
            cleaned = re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F\s]", "", segment.text.lower()).strip()
            for w in cleaned.split():
                if w:
                    audio_words.append({
                        "word": w,
                        "start": float(segment.start),
                        "end": float(segment.end)
                    })
            srt_entries.append((entry_idx, segment.start, segment.end, segment.text.strip()))
            entry_idx += 1

    print(f"Writing {len(srt_entries)} subtitle cues to: {srt_path}")
    with open(srt_path, "w", encoding="utf-8") as f:
        for idx, s_start, s_end, s_text in srt_entries:
            start_str = format_srt_time(s_start)
            end_str = format_srt_time(s_end)
            f.write(f"{idx}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{s_text}\n\n")

    print(f"Transcription complete. Transcribed {len(audio_words)} words and {len(srt_entries)} subtitle cues.")

    # Immediately release Whisper model buffers and garbage collect
    try:
        del model
        del segments
    except Exception:
        pass
    gc.collect()

    return audio_words
