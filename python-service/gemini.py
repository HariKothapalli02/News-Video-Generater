import os
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_GOOG_LOG_SEVERITY_THRESHOLD"] = "3"

import json
import re
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"

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


def generate_script(news_items, subject, language, custom_prompt=""):
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in .env file.")

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
1. Target Language: {language}. You MUST write the ENTIRE script (except English format labels like "Fact 1", "Outro", etc.) in {language} (using native characters, e.g., Devanagari script for Hindi, Telugu script for Telugu).
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

    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(prompt)
    return response.text.strip()


def generate_scene_plan(script, max_scenes=15):
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in .env file.")

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
- search_query: best Pexels video query, 2 to 5 words in English (Pexels API only accepts English search terms, so translate the keyword/query to English if the script is in Hindi or Telugu)
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

    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(prompt)
    cleaned = clean_json_response(response.text)
    
    try:
        data = json.loads(cleaned)
    except Exception as e:
        print("Failed to parse JSON scene plan, falling back to local text processing.", e)
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
