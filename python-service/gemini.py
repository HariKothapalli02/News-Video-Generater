import os
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_GOOG_LOG_SEVERITY_THRESHOLD"] = "3"

import json
import re
import time
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def clean_json_response(text):
    text = text.strip()
    text = text.replace("```json", "").replace("```", "").strip()

    start_bracket = text.find("[")
    start_brace = text.find("{")

    if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
        start = start_bracket
        end = text.rfind("]")
    elif start_brace != -1:
        start = start_brace
        end = text.rfind("}")
    else:
        start = -1
        end = -1

    if start != -1 and end != -1:
        text = text[start:end + 1]

    return text


def execute_gemini_with_retry(prompt, model_name=GEMINI_MODEL, max_retries=4):
    """
    Calls Gemini API with automated backoff for 429 ResourceExhausted rate-limits.
    If 429 persists, gracefully falls back to available flash models.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in .env file.")

    models_to_try = [model_name]
    # Add fallback models if not already primary
    for alt in ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"]:
        if alt not in models_to_try:
            models_to_try.append(alt)

    last_error = None
    for current_model_name in models_to_try:
        model = genai.GenerativeModel(current_model_name)
        for attempt in range(1, max_retries + 1):
            try:
                print(f"[LOG] Querying Gemini model '{current_model_name}' (attempt {attempt}/{max_retries})...")
                response = model.generate_content(prompt)
                if response and response.text:
                    return response.text.strip()
                raise ValueError("Empty response received from Gemini.")
            except Exception as e:
                err_str = str(e)
                last_error = e

                # Detect 429 Quota Exceeded / Rate Limit
                if "429" in err_str or "ResourceExhausted" in err_str or "quota" in err_str.lower():
                    # Parse retry_delay seconds if provided in error message
                    sleep_match = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", err_str)
                    retry_seconds_match = re.search(r"retry in ([0-9.]+)s", err_str)
                    
                    if sleep_match:
                        wait_sec = min(60, int(sleep_match.group(1)) + 2)
                    elif retry_seconds_match:
                        wait_sec = min(60, int(float(retry_seconds_match.group(1))) + 2)
                    else:
                        wait_sec = 25 * attempt

                    print(f"[LOG] Gemini 429 Rate Limit encountered. Pausing {wait_sec}s for free tier quota refresh...")
                    time.sleep(wait_sec)
                else:
                    print(f"[LOG] Gemini request failed with error: {e}")
                    time.sleep(3 * attempt)

    raise last_error or RuntimeError("Gemini failed after retry attempts.")


def generate_script(news_items, subject, language, custom_prompt=""):
    formatted_news = []
    for idx, item in enumerate(news_items, 1):
        formatted_news.append(
            f"Story #{idx}:\nTitle: {item['title']}\nDescription: {item['description']}\nCategory: {item['category']}\nSource: {item['source']}\n"
        )
    news_text = "\n".join(formatted_news)

    # Format clean subject for header
    clean_subj = re.sub(r"\bnews\b", "", subject, flags=re.IGNORECASE).strip().upper()
    if not clean_subj:
        clean_subj = "TECH"

    prompt = f"""
You are a professional YouTube news anchor and scriptwriter for ByteWire AI News.
Analyze the following RSS news items and select the TOP 10 most interesting and trending stories.
Create a complete, cinematic, and highly engaging news narration script.

Requirements:
1. Target Language: English. You MUST write the ENTIRE script in fluent, broadcast-ready, punchy English suitable for a professional YouTube news video.
2. Video Subject Focus: {subject}.
3. Custom Prompt/Directions: {custom_prompt or "None provided"}.

4. Output Formatting (CRITICAL: You MUST follow this exact format with the exact line breaks, and NO other text):

BYTEWIRE TOP 10 {clean_subj} NEWS
Fact 1
[Short Title of Fact 1 in {language}]

[Description of Fact 1 in {language} (3 to 4 sentences, engaging and punchy)]

Fact 2
[Short Title of Fact 2 in {language}]

[Description of Fact 2 in {language} (3 to 4 sentences, engaging and punchy)]

...

Fact 10
[Short Title of Fact 10 in {language}]

[Description of Fact 10 in {language} (3 to 4 sentences, engaging and punchy)]

Outro

[Outro content in {language} (e.g. "Those were the Top 10 {subject} news stories you need to know today. For daily updates on AI, technology, startups, cybersecurity and future innovations, stay tuned to ByteWire. Subscribe and turn on notifications so you never miss the next big tech story.")]

Rules:
- DO NOT include scene numbers, camera cues, director notes, music tags, or speaker names.
- Output ONLY the formatted script text. Do not wrap in markdown or code blocks.

NEWS ITEMS:
{news_text}
"""

    return execute_gemini_with_retry(prompt)


def generate_scene_plan(script, max_scenes=15):
    prompt = f"""
You are a professional faceless YouTube video editor.
Analyze this script and create a cinematic background video plan.

Return ONLY a valid JSON object.

The JSON object must have exactly two keys:
1. "video_context": A short summary (1 sentence, 5-10 words) of the overarching theme/context of the entire video (e.g. "futuristic technology and artificial intelligence in daily life").
2. "scenes": An array of scene objects.

Each scene object in the "scenes" array must contain:
- scene_text: short script portion in its original language
- keyword: one important word from the script that is likely spoken in the audio
- search_query: best Pexels video query, 2 to 5 concrete visual words in English
- scene_context: a short description of the context/action happening in this specific scene (3 to 8 words in English)
- mood: cinematic / dramatic / tech / finance / emotional / news / documentary

Rules:
- Maximum {max_scenes} scenes.
- Use concrete visual Pexels queries in English (e.g., "AI data center", "space satellite", "smart city traffic", "stock market graph").
- Avoid abstract searches like "success", "future", "growth", "news".
- keyword must be a key word spoken in that scene's audio.
- Do NOT create captions or text overlays.
- Return JSON only. No markdown. No explanation.

SCRIPT:
{script}
"""

    raw_response = execute_gemini_with_retry(prompt)
    cleaned = clean_json_response(raw_response)
    
    try:
        data = json.loads(cleaned)
    except Exception as e:
        print("[LOG] Failed to parse JSON scene plan, falling back to local text processing:", e)
        data = {"video_context": "news broadcast", "scenes": []}

    scenes = data.get("scenes", [])
    video_context = data.get("video_context", "cinematic compilation")

    final_scenes = []
    for scene in scenes:
        if scene.get("search_query"):
            final_scenes.append({
                "scene_text": str(scene.get("scene_text", "")),
                "keyword": re.sub(r"[^a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]", "", str(scene.get("keyword", ""))).lower().strip(),
                "search_query": str(scene.get("search_query", "cinematic background")).lower().strip(),
                "scene_context": str(scene.get("scene_context", "")).strip(),
                "mood": str(scene.get("mood", "cinematic")).strip()
            })

    return {
        "video_context": video_context,
        "scenes": final_scenes
    }
