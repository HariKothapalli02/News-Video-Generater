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


def generate_audio(text, output_file, language="english"):
    model_path = ensure_voice_model(language)
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
    return output_file
