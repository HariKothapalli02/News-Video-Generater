import os
import wave
import requests
import re
from dotenv import load_dotenv
from piper.voice import PiperVoice

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

VOICES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "piper"))
os.makedirs(VOICES_DIR, exist_ok=True)

VOICE_MODELS = {
    "english": {
        "model_name": "en_US-hfc_male-medium",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx.json"
    },
    "hindi": {
        "model_name": "hi_IN-rohan-medium",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/rohan/medium/hi_IN-rohan-medium.onnx.json"
    },
    "telugu": {
        "model_name": "te_IN-padmavathi-medium",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx.json"
    }
}


def download_file(url, local_path):
    print(f"Downloading {url} ...")
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()
    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0
    with open(local_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=1024 * 64):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    print(f"\rDownload progress: {percent:.1f}% ({downloaded / (1024 * 1024):.2f}MB/{total_size / (1024 * 1024):.2f}MB)", end="", flush=True)
    print()


def ensure_voice_model(lang_key):
    lang_key = lang_key.lower().strip()
    if lang_key not in VOICE_MODELS:
        print(f"Language '{lang_key}' not directly supported. Falling back to English.")
        lang_key = "english"

    voice_info = VOICE_MODELS[lang_key]
    model_name = voice_info["model_name"]
    model_path = os.path.join(VOICES_DIR, f"{model_name}.onnx")
    json_path = os.path.join(VOICES_DIR, f"{model_name}.onnx.json")

    if not os.path.exists(model_path):
        print(f"Voice model file not found locally: {model_path}")
        try:
            download_file(voice_info["url_onnx"], model_path)
        except Exception as e:
            print(f"Failed to download voice ONNX model: {e}")
            if os.path.exists(model_path):
                os.remove(model_path)
            raise e

    if not os.path.exists(json_path):
        print(f"Voice model configuration not found locally: {json_path}")
        try:
            download_file(voice_info["url_json"], json_path)
        except Exception as e:
            print(f"Failed to download voice config JSON: {e}")
            if os.path.exists(json_path):
                os.remove(json_path)
            raise e

    return model_path


def parse_script_into_audio_segments(text):
    lines = [line.strip() for line in text.splitlines()]
    
    segments = []
    header = ""
    current_fact_num = None
    current_fact_title = None
    current_fact_content = []
    
    outro_content = []
    state = "HEADER" # HEADER, LOOKING_FOR_FACT, FACT_TITLE, FACT_CONTENT, OUTRO
    
    for line in lines:
        if not line:
            continue
        
        # Check if this line marks a new section
        fact_match = re.match(r"^Fact\s+(\d+)", line, re.IGNORECASE)
        if fact_match:
            if current_fact_num is not None:
                segments.append({
                    "num": current_fact_num,
                    "title": current_fact_title or "",
                    "content": " ".join(current_fact_content).strip()
                })
            current_fact_num = int(fact_match.group(1))
            current_fact_title = None
            current_fact_content = []
            state = "FACT_TITLE"
            continue
            
        if line.lower() == "outro":
            if current_fact_num is not None:
                segments.append({
                    "num": current_fact_num,
                    "title": current_fact_title or "",
                    "content": " ".join(current_fact_content).strip()
                })
                current_fact_num = None
            state = "OUTRO"
            continue
            
        if state == "HEADER":
            header = line
            state = "LOOKING_FOR_FACT"
        elif state == "FACT_TITLE":
            current_fact_title = line
            state = "FACT_CONTENT"
        elif state == "FACT_CONTENT":
            current_fact_content.append(line)
        elif state == "OUTRO":
            outro_content.append(line)
            
    if current_fact_num is not None:
        segments.append({
            "num": current_fact_num,
            "title": current_fact_title or "",
            "content": " ".join(current_fact_content).strip()
        })
        
    return {
        "header": header,
        "facts": segments,
        "outro": " ".join(outro_content).strip()
    }


def generate_telugu_edge_tts(text, output_file):
    """
    Synthesizes Telugu news voiceover via Microsoft Edge-TTS with high-pitch male anchor voice:
    - Voice: te-IN-MohanNeural
    - Pitch: +25Hz (sharp, alert, high-energy breaking news tone)
    - Rate: +5% (crisp news broadcast cadence)
    - Fallback: Google Free Telugu TTS if Edge-TTS is temporarily unreachable
    """
    import asyncio
    import subprocess
    import shutil
    import urllib.request
    import urllib.parse

    parsed = parse_script_into_audio_segments(text)
    temp_dir = os.path.dirname(os.path.abspath(output_file))
    temp_mp3 = os.path.join(temp_dir, "temp_telugu_edge.mp3")

    spoken_parts = []
    if parsed["header"]:
        spoken_parts.append(parsed["header"])
    for f in parsed["facts"]:
        spoken_parts.append(f"Fact {f['num']}. {f['title']}. {f['content']}")
    if parsed["outro"]:
        spoken_parts.append(parsed["outro"])

    full_spoken_text = "\n\n".join(spoken_parts) if spoken_parts else text

    print(f"[TTS] Synthesizing Telugu News with Microsoft Edge-TTS (te-IN-MohanNeural, Pitch: +25Hz, Rate: +5%)...")

    edge_succeeded = False
    try:
        import edge_tts

        async def _run_edge():
            communicate = edge_tts.Communicate(
                text=full_spoken_text,
                voice="te-IN-MohanNeural",
                pitch="+25Hz",
                rate="+5%"
            )
            await communicate.save(temp_mp3)

        asyncio.run(_run_edge())
        if os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 1000:
            edge_succeeded = True
            print(f"[TTS] Edge-TTS Telugu synthesis completed ({os.path.getsize(temp_mp3) / 1024:.1f} KB).")
    except Exception as e:
        print(f"[TTS Warning] Microsoft Edge-TTS error ({e}). Switching to Google Telugu TTS engine fallback...")

    if not edge_succeeded:
        # Fallback to Google Free Telugu TTS
        chunks = [full_spoken_text[i:i + 170] for i in range(0, len(full_spoken_text), 170)]
        combined_audio = bytearray()
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"}
        for chunk in chunks:
            if not chunk.strip():
                continue
            enc = urllib.parse.quote(chunk)
            url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={enc}&tl=te&client=tw-ob"
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=12) as resp:
                    combined_audio.extend(resp.read())
            except Exception as ge:
                print(f"[TTS Warning] Google chunk error: {ge}")
        with open(temp_mp3, "wb") as f:
            f.write(combined_audio)
        print(f"[TTS] Google Telugu TTS fallback completed ({os.path.getsize(temp_mp3) / 1024:.1f} KB).")

    # Convert MP3 to standard broadcast 16-bit 48kHz stereo WAV for MoviePy/FFmpeg
    ffmpeg_exe = shutil.which("ffmpeg") or "ffmpeg"
    convert_cmd = [
        ffmpeg_exe, "-y",
        "-i", temp_mp3,
        "-ar", "48000",
        "-ac", "2",
        "-c:a", "pcm_s16le",
        output_file
    ]
    subprocess.run(convert_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if os.path.exists(temp_mp3):
        try:
            os.remove(temp_mp3)
        except Exception:
            pass

    print(f"[TTS] Broadcast WAV voiceover generated: {output_file} ({os.path.getsize(output_file) / 1024:.1f} KB)")
    return output_file


def generate_audio(text, output_file, language="english"):
    lang_clean = (language or "english").lower().strip()
    if lang_clean == "telugu":
        return generate_telugu_edge_tts(text, output_file)

    model_path = ensure_voice_model(lang_clean)
    print(f"Loading Piper voice model from: {model_path}")
    voice = PiperVoice.load(model_path)

    print(f"Generating narration file with 1-second gaps: {output_file}")
    wav_file = wave.open(output_file, "wb")
    
    # State variables for wav configuration
    wav_params_set = False
    sample_rate = None
    sample_width = None
    channels = None

    def write_text(txt):
        nonlocal wav_params_set, sample_rate, sample_width, channels
        if not txt.strip():
            return
        print(f"[TTS] Synthesizing: {txt[:40]}...")
        for audio_chunk in voice.synthesize(txt):
            if not wav_params_set:
                wav_file.setframerate(audio_chunk.sample_rate)
                wav_file.setsampwidth(audio_chunk.sample_width)
                wav_file.setnchannels(audio_chunk.sample_channels)
                
                sample_rate = audio_chunk.sample_rate
                sample_width = audio_chunk.sample_width
                channels = audio_chunk.sample_channels
                
                wav_params_set = True
                
            wav_file.writeframes(audio_chunk.audio_int16_bytes)

    def write_silence(duration_sec=1.0):
        if not wav_params_set or sample_rate is None:
            return
        num_frames = int(sample_rate * duration_sec)
        silence_bytes = b'\x00' * (num_frames * sample_width * channels)
        wav_file.writeframes(silence_bytes)

    parsed = parse_script_into_audio_segments(text)
    
    with wav_file:
        if parsed["facts"]:
            # Speak Header
            if parsed["header"]:
                write_text(parsed["header"])
                write_silence(1.0)
                
            # Speak Facts
            for fact in parsed["facts"]:
                # Fact X label
                write_text(f"Fact {fact['num']}")
                write_silence(1.0)
                
                # Title
                if fact["title"]:
                    write_text(fact["title"])
                    write_silence(1.0)
                    
                # Content
                if fact["content"]:
                    write_text(fact["content"])
                    write_silence(1.0)
                    
            # Speak Outro
            if parsed["outro"]:
                write_text(parsed["outro"])
        else:
            # Fallback to synthesizing the entire script at once (original behavior)
            print("[TTS Warning] Could not parse facts, falling back to full text synthesis.")
            write_text(text)

    print("Narration WAV file generated successfully.")
    try:
        del voice
    except Exception:
        pass
    import gc
    gc.collect()

    return output_file
