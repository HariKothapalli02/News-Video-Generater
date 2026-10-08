import os
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_GOOG_LOG_SEVERITY_THRESHOLD"] = "3"

import sys
for _stream in (sys.stdout, sys.stderr):
    _reconfig = getattr(_stream, "reconfigure", None)
    if callable(_reconfig):
        try:
            _reconfig(encoding="utf-8", errors="replace")
        except Exception:
            pass

import json
import re
import time
from dotenv import load_dotenv
import google.generativeai as genai

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def get_gemini_api_keys():
    """
    Dynamically reloads the .env file to fetch fresh Gemini API keys.
    Supports single GEMINI_API_KEY or comma/semicolon-separated GEMINI_API_KEYS.
    """
    load_dotenv(ENV_PATH, override=True)
    raw_keys = []

    # Check both GEMINI_API_KEYS and GEMINI_API_KEY
    if os.getenv("GEMINI_API_KEYS"):
        raw_keys.extend(re.split(r"[,;\n]+", os.getenv("GEMINI_API_KEYS", "")))
    if os.getenv("GEMINI_API_KEY"):
        raw_keys.extend(re.split(r"[,;\n]+", os.getenv("GEMINI_API_KEY", "")))

    valid_keys = [k.strip().strip("'\"") for k in raw_keys if k and len(k.strip()) > 10]
    # Deduplicate while preserving order
    seen = set()
    unique_keys = []
    for k in valid_keys:
        if k not in seen:
            seen.add(k)
            unique_keys.append(k)

    return unique_keys


def get_gemini_model():
    load_dotenv(ENV_PATH, override=True)
    return os.getenv("GEMINI_MODEL", "gemini-flash-latest")


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


RR_STATE_FILE = os.path.join(os.path.dirname(__file__), ".gemini_rr_state.json")


def _load_rr_state():
    """Reads persistent round-robin index and cooldowns."""
    try:
        if os.path.exists(RR_STATE_FILE):
            with open(RR_STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"next_index": 0, "cooldowns": {}}


def _save_rr_state(state):
    """Saves persistent round-robin index and cooldowns."""
    try:
        with open(RR_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception:
        pass


def execute_gemini_with_retry(prompt, model_name=None, max_retries=5):
    """
    Calls Gemini API using an enhanced Round-Robin key rotation and multi-model fallback algorithm.
    - Evenly balances API requests across all available GEMINI_API_KEYS.
    - Uses 'gemini-flash-latest' and falls back to 'gemini-3.5-flash-lite' to avoid 429 free-tier daily limits.
    - Tracks cooldowns on 429 quota limits so subsequent calls skip exhausted keys.
    - If a key encounters 429 / Quota Limit, instantly fails over to the next key or fallback model.
    """
    keys = get_gemini_api_keys()
    if not keys:
        raise ValueError("No valid GEMINI_API_KEY or GEMINI_API_KEYS found in .env file.")

    num_keys = len(keys)
    state = _load_rr_state()
    cooldowns = state.get("cooldowns", {})
    now = time.time()

    # Clean expired cooldowns
    cooldowns = {k: exp for k, exp in cooldowns.items() if exp > now}

    start_index = int(state.get("next_index", 0)) % num_keys
    # Advance the round-robin cursor for the next request to balance load
    state["next_index"] = (start_index + 1) % num_keys
    state["cooldowns"] = cooldowns
    _save_rr_state(state)

    # Standard round-robin order: [start, start+1, ..., start-1]
    candidate_keys = [keys[(start_index + i) % num_keys] for i in range(num_keys)]

    # Separate into ready keys and keys on cooldown
    ready_keys = [k for k in candidate_keys if k not in cooldowns]
    cooling_keys = [k for k in candidate_keys if k in cooldowns]
    ordered_keys = ready_keys + cooling_keys if ready_keys else cooling_keys

    # Model fallback hierarchy: prefer high-quota flash models
    primary_model = model_name or get_gemini_model() or "gemini-flash-latest"
    models_to_try = [primary_model]
    for alt_model in ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-2.5-flash"]:
        if alt_model not in models_to_try:
            models_to_try.append(alt_model)

    first_key_num = keys.index(ordered_keys[0]) + 1
    print(f"[LOG] Gemini Load-Balancer: {num_keys} key(s) in pool ({len(ready_keys)} active). Starting with Key #{first_key_num} (Model: {models_to_try[0]})...")

    last_error = None

    for attempt_round in range(1, max_retries + 1):
        all_keys_quota_limited = True
        quota_wait_sec = 60

        for key_idx, current_key in enumerate(ordered_keys):
            genai.configure(api_key=current_key)
            masked_key = current_key[:6] + "..." + current_key[-4:] if len(current_key) > 10 else "***"
            key_num = keys.index(current_key) + 1

            for active_model in models_to_try:
                try:
                    print(f"[LOG] Querying Gemini model '{active_model}' (Key #{key_num}: {masked_key}, round {attempt_round}/{max_retries})...")
                    model = genai.GenerativeModel(active_model)
                    response = model.generate_content(prompt)
                    if response and response.text:
                        # Clear cooldown on success
                        if current_key in cooldowns:
                            cooldowns.pop(current_key, None)
                            state["cooldowns"] = cooldowns
                            _save_rr_state(state)
                        return response.text.strip()
                    raise ValueError("Empty response received from Gemini.")
                except Exception as e:
                    err_str = str(e)
                    last_error = e

                    is_rate_limit = "429" in err_str or "ResourceExhausted" in err_str or "quota" in err_str.lower()
                    is_daily_limit = ("GenerateRequestsPerDay" in err_str) or ("free_tier_requests" in err_str) or ("limit: 20" in err_str)

                    if is_rate_limit:
                        print(f"[LOG] Gemini 429 / Quota Limit on Key #{key_num} ({masked_key}) with model '{active_model}'.")
                        
                        # If it's a daily limit for this specific model, try the next fallback model on this key immediately
                        if is_daily_limit and active_model != models_to_try[-1]:
                            next_model = models_to_try[models_to_try.index(active_model) + 1]
                            print(f"[LOG] Model quota exhausted on Key #{key_num}. Instant model failover -> trying '{next_model}'...")
                            continue

                        # Parse suggested retry delay
                        sleep_match = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", err_str)
                        retry_seconds_match = re.search(r"retry in ([0-9.]+)s", err_str)
                        if sleep_match:
                            quota_wait_sec = min(65, int(sleep_match.group(1)) + 2)
                        elif retry_seconds_match:
                            quota_wait_sec = min(65, int(float(retry_seconds_match.group(1))) + 2)
                        elif is_daily_limit:
                            quota_wait_sec = 1800  # 30 min cooldown on daily exhaustion

                        # Put key on cooldown
                        cooldowns[current_key] = time.time() + quota_wait_sec
                        state["cooldowns"] = cooldowns
                        _save_rr_state(state)

                        # Fail over to next key
                        if key_idx < len(ordered_keys) - 1:
                            next_key = ordered_keys[key_idx + 1]
                            next_num = keys.index(next_key) + 1
                            print(f"[LOG] Instant round-robin failover -> switching to Key #{next_num} immediately.")
                        break
                    else:
                        # Non-rate-limit error (e.g. temporary network error)
                        all_keys_quota_limited = False
                        print(f"[LOG] Gemini request on Key #{key_num} failed ({active_model}): {e}")
                        break

        # If all keys were exhausted in this round, pause before retrying the pool
        if attempt_round < max_retries:
            if all_keys_quota_limited:
                wait_time = min(quota_wait_sec, 60)
                print(f"[LOG] All {num_keys} Gemini keys reached quota limit. Pausing {wait_time}s for refresh...")
                time.sleep(wait_time)
            else:
                time.sleep(2 * attempt_round)

    raise last_error or RuntimeError("Gemini failed after trying all keys in round-robin pool.")


def select_top_10_news(candidate_items, subject, video_type="tech_news", count=None):
    """
    Uses Gemini AI to evaluate candidate RSS news items and select the TOP 10 news stories
    in a SINGLE API request. The first 3 stories (items #1, #2, #3) are ranked as the Top 3
    viral stories to be converted into shorts.
    """
    if count is None or count < 10:
        count = 10

    if not candidate_items:
        return []

    if len(candidate_items) <= count:
        return candidate_items

    # Format candidate list for Gemini (up to 40 candidates evaluated at once)
    formatted_candidates = []
    for idx, item in enumerate(candidate_items[:40], 1):
        formatted_candidates.append(
            f"Item #{idx}:\nTitle: {item.get('title')}\nDescription: {item.get('description', '')[:300]}\nSource: {item.get('source')}\nCategory: {item.get('category')}\n"
        )
    candidates_text = "\n".join(formatted_candidates)

    prompt = f"""
You are an expert news editor, audience analyst, and viral YouTube news strategist.
Evaluate the following {len(formatted_candidates)} candidate news stories and select the TOP {count} most trending news stories with the HIGHEST Click-Through Rate (CTR) potential, breaking relevance, and viral public curiosity.

Topic Focus: {subject}
Category: {video_type}

Selection Rules:
1. Top Trending Appeal: Select the top {count} most trending, high-CTR stories that make viewers immediately stop, click, and watch (major breaking developments, high-stakes decisions, breakthrough AI/tech, dramatic public moves, explosive updates).
2. Rank by Virality: Rank them #1 through #{count} in descending order of CTR and viral hook. The first 3 stories (items #1, #2, and #3) MUST be the absolute top 3 most sensational, viral-worthy breaking stories, as they will also be converted into dedicated YouTube Shorts.
3. True Impact & Significance: Prioritize genuine breaking news, major national/global affairs, and high-interest topics trending right now.
4. Reject Low-Value Noise: Filter out routine PR updates, trivial corporate announcements, and boring fluff.
5. Exactly {count} Stories: Select exactly {count} distinct top trending stories.

Return ONLY a valid JSON array of {count} objects in this exact structure:
[
  {{
    "index": 1,
    "title": "Punchy, high-CTR headline for this story",
    "description": "2 to 3 sentences explaining what happened and why it matters",
    "source": "Source outlet name",
    "category": "Category name",
    "ctr_score": 98,
    "viral_hook": "Short 1-sentence explanation of why this story has high viewer appeal",
    "is_top_short": true
  }}
]
Do not wrap in markdown or explanation. Return JSON only.

CANDIDATE STORIES:
{candidates_text}
"""

    print(f"[LOG] Running Gemini AI to evaluate candidate pool and select Top {count} High-CTR stories in 1 request (Top 3 designated for shorts)...")
    try:
        raw_response = execute_gemini_with_retry(prompt)
        cleaned = clean_json_response(raw_response)
        parsed = json.loads(cleaned)

        if isinstance(parsed, list) and len(parsed) >= 1:
            selected_items = []
            for entry in parsed[:count]:
                selected_items.append({
                    "title": entry.get("title", ""),
                    "description": entry.get("description", ""),
                    "source": entry.get("source", "ByteWire News"),
                    "category": entry.get("category", video_type),
                    "ctr_score": entry.get("ctr_score", 90),
                    "viral_hook": entry.get("viral_hook", ""),
                    "is_top_short": entry.get("is_top_short", False)
                })

            print(f"[LOG] Gemini successfully selected Top {len(selected_items)} stories in single request:")
            for i, itm in enumerate(selected_items, 1):
                short_tag = " [TOP 3 SHORT]" if i <= 3 else ""
                safe_title = itm.get('title', '').encode('ascii', errors='replace').decode('ascii')
                print(f"  {i}. [CTR: {itm.get('ctr_score', 'N/A')}]{short_tag} {safe_title} ({itm['source']})")
            return selected_items

    except Exception as e:
        print(f"[LOG] Warning: Gemini top selection encountered an issue ({e}). Falling back to freshest candidate stories.")

    # Graceful fallback: return top freshest items
    return candidate_items[:count]


def generate_script(news_items, subject, language, custom_prompt=""):
    num_facts = len(news_items)
    # Ensure minimum 10 facts if news_items provides enough
    if num_facts < 10 and len(news_items) >= 10:
        num_facts = 10

    formatted_news = []
    for idx, item in enumerate(news_items[:num_facts], 1):
        hook_info = f" (Hook: {item['viral_hook']})" if item.get("viral_hook") else ""
        formatted_news.append(
            f"Story #{idx}:\nTitle: {item['title']}\nDescription: {item['description']}\nCategory: {item['category']}\nSource: {item['source']}{hook_info}\n"
        )
    news_text = "\n".join(formatted_news)

    # Format clean subject for header
    clean_subj = re.sub(r"\bnews\b", "", subject, flags=re.IGNORECASE).strip().upper()
    if not clean_subj:
        clean_subj = "TOP"

    # Build explicit requirement for each fact from 1 to num_facts so LLM never skips any
    template_facts = []
    for i in range(1, num_facts + 1):
        template_facts.append(
            f"Fact {i}\n"
            f"[Catchy 4-8 word Title for Story #{i} in {language}]\n\n"
            f"[Engaging 3 to 4 sentence broadcast narration covering Story #{i} in {language}]"
        )
    facts_template_str = "\n\n".join(template_facts)

    prompt = f"""
You are a professional YouTube news anchor and senior scriptwriter for ByteWire AI News.
Using the following TOP {num_facts} curated and verified stories, create a complete, cinematic, and highly engaging news narration broadcast script.

CRITICAL REQUIREMENTS:
1. YOU MUST COVER ALL {num_facts} STORIES! The script MUST contain EXACTLY {num_facts} sections: Fact 1, Fact 2, Fact 3, Fact 4, Fact 5, Fact 6, Fact 7, Fact 8, Fact 9, up to Fact {num_facts}.
2. DO NOT STOP EARLY. DO NOT SKIP ANY FACT NUMBER. Every single number from Fact 1 to Fact {num_facts} must be present in sequence!
3. Target Language: {language}. Write the ENTIRE script in fluent, broadcast-ready, punchy {language} suitable for a professional YouTube news video.
4. Video Subject Focus: {subject}.
5. Custom Prompt/Directions: {custom_prompt or "None provided"}.

6. Output Formatting (CRITICAL: You MUST strictly adhere to this exact sequential structure and line breaks, with NO additional commentary, markdown tags, or cues):

BYTEWIRE TOP {num_facts} {clean_subj} NEWS

{facts_template_str}

Outro

[Outro narration in {language} (e.g. "Those were the Top {num_facts} {subject} news stories you need to know today. For daily updates on breaking news, technology, politics, and future trends, stay tuned to ByteWire. Subscribe and turn on notifications so you never miss the next big story.")]

Rules:
- DO NOT include scene numbers, camera cues, director notes, music tags, or speaker names.
- Output ONLY the formatted script text containing all {num_facts} facts from Fact 1 to Fact {num_facts}. Do not wrap in markdown or code blocks.

NEWS STORIES:
{news_text}
"""

    raw_script = execute_gemini_with_retry(prompt)

    # Verification: check if all num_facts were generated
    found_facts = len(re.findall(r"(?:Fact|FACT)\s+\d+", raw_script))
    if found_facts < num_facts:
        print(f"[LOG] Warning: Generated script produced {found_facts}/{num_facts} facts. Triggering strict completion pass...")
        retry_prompt = prompt + f"\n\nIMPORTANT: Your previous output only included {found_facts} facts. You MUST generate ALL {num_facts} facts sequentially from Fact 1 through Fact {num_facts} and then Outro. Do not omit any numbers!"
        try:
            retry_script = execute_gemini_with_retry(retry_prompt)
            retry_found = len(re.findall(r"(?:Fact|FACT)\s+\d+", retry_script))
            if retry_found > found_facts:
                raw_script = retry_script
                print(f"[LOG] Script completion successful: recovered {retry_found}/{num_facts} facts.")
        except Exception as e:
            print(f"[LOG] Retry exception ({e}), keeping primary script.")

    return raw_script


def generate_scene_plan(script, max_scenes=35):
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
- Use concrete visual Pexels queries in English (e.g., "parliament building", "courtroom gavel", "AI data center", "space satellite", "smart city traffic", "stock market graph").
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


def generate_video_metadata(subject, script_text, facts, language="english"):
    """
    Generates YouTube Title, 3 Alternative Titles, Thumbnail Hook, full SEO Description
    with Chapter Timestamps, and 20+ viral Tags in ONE single API call to Gemini.
    """
    chapters_text = []
    for f in facts:
        start_sec = f.get("startTime", 0)
        m = int(start_sec // 60)
        s = int(start_sec % 60)
        time_str = f"{m:02d}:{s:02d}"
        clean_title = f.get('title', '').replace('*', '').strip()
        chapters_text.append(f"{time_str} - {clean_title}")
    chapters_formatted = "\n".join(chapters_text) if chapters_text else "00:00 - Breaking Intro\n... Top Stories"
    clean_subject_tag = re.sub(r"[^a-zA-Z0-9]", "", subject)

    prompt = f"""
You are an elite YouTube news creator, viral media strategist, and CTR optimization expert.
Create the ultimate high-CTR, high-retention YouTube metadata for this breaking news video.

Topic Focus: {subject}
Language: {language}
Number of Stories: {len(facts)}

Timeline / Chapters:
{chapters_formatted}

Script Excerpt:
{script_text[:1400]}

STRATEGY & CTR RULES:
1. Primary Title:
   - Must be UNDER 75 characters so it is never truncated on mobile screens.
   - Use proven YouTube news formulas (e.g., "IT FINALLY HAPPENED: Top 10 Breaking News Stories", "They Can't Hide This: Top 10 Shocking Updates", "The Big Shift: 10 Major Stories Breaking Today").
   - Arouse intense curiosity and urgency without false clickbait.
2. Alternative Titles (3 options):
   - Option 1 (Curiosity Gap): e.g. "What Everyone Is Missing About Today's News"
   - Option 2 (High Stakes / Impact): e.g. "This Changes Everything: Top 10 Major Updates"
   - Option 3 (Direct Breaking News): e.g. "Top 10 Developing Stories Breaking Right Now"
3. Thumbnail Hook:
   - 2 to 4 words in ALL CAPS suitable for a massive thumbnail badge (e.g., "IT BEGAN!", "MAJOR SHIFT!", "WHAT HAPPENED?").
4. Description:
   - Hook: 2 captivating sentences that summarize the drama and magnitude of the news.
   - Chapters: EXACT formatted timestamps list ({chapters_formatted}).
   - Engagement: A compelling question prompting viewers to comment below.
   - Channel CTA: Encouraging subscription and notification bell for daily updates.
   - Hashtags: 5-8 trending viral hashtags (#news #breakingnews #trending #viral #{clean_subject_tag} #bytewire).
5. Tags:
   - 18 to 22 highly searched, relevant YouTube tags.

Return ONLY a valid JSON object in this exact format:
{{
  "title": "Primary High-CTR Title Under 75 Chars",
  "titles": [
    "Alternative High-CTR Option 1",
    "Alternative High-CTR Option 2",
    "Alternative High-CTR Option 3"
  ],
  "thumbnail_hook": "PUNCHY 2-4 WORD HOOK",
  "description": "Full description text here...",
  "tags": [
    "tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10",
    "tag11", "tag12", "tag13", "tag14", "tag15", "tag16", "tag17", "tag18", "tag19", "tag20"
  ]
}}
Do not wrap in markdown or commentary. Return pure JSON only.
"""
    print("[LOG] Running Gemini AI to generate high-CTR full video YouTube metadata (Titles, Hook, Description, Tags)...")
    try:
        raw = execute_gemini_with_retry(prompt)
        cleaned = clean_json_response(raw)
        data = json.loads(cleaned)
        return {
            "title": data.get("title", f"Top 10 {subject.title()} News You Need To Know Today"),
            "titles": data.get("titles", []),
            "thumbnail_hook": data.get("thumbnail_hook", "BREAKING NEWS"),
            "description": data.get("description", ""),
            "tags": data.get("tags", [subject, "news", "breaking news", "top 10", "trending news", "daily update"])
        }
    except Exception as e:
        print(f"[LOG] Warning: Failed to generate/parse video metadata JSON ({e}). Falling back to optimized template.")
        clean_tag = re.sub(r"[^a-zA-Z0-9]", "", subject)
        return {
            "title": f"BREAKING: Top 10 {subject.title()} Stories Breaking Right Now!",
            "titles": [
                f"What You Need To Know: Top 10 {subject.title()} Updates",
                f"This Just Happened: 10 Major {subject.title()} Developments",
                f"The Biggest {subject.title()} News Explained"
            ],
            "thumbnail_hook": "MAJOR ALERT!",
            "description": f"Here are the top 10 verified {subject} news stories you must know today. From breaking developments to major announcements, here is everything you need to know.\n\n📌 TIMESTAMPS:\n{chapters_formatted}\n\n💬 Which story impacts you the most? Drop your thoughts below!\n🔔 Subscribe to ByteWire AI News for daily verified news updates.\n\n#news #breakingnews #trending #viral #{clean_tag} #bytewire",
            "tags": [subject, "news", "trending", "breaking news", "updates", "top 10", "daily news", "bytewire"]
        }


def generate_shorts_metadata(facts, subject, language="english"):
    """
    Generates viral YouTube Shorts metadata (Hook Title with #Shorts, engaging Description,
    and Tags) for all facts in ONE single API call to Gemini.
    """
    facts_summary = []
    for f in facts:
        facts_summary.append(f"Fact #{f.get('factIndex', 1)}: {f.get('title', '')} - {f.get('description', '')[:180]}")
    facts_text = "\n".join(facts_summary)

    clean_subject_tag = re.sub(r"[^a-zA-Z0-9]", "", subject)

    prompt = f"""
You are a top-tier YouTube Shorts & viral TikTok strategist.
For each of the following {len(facts)} news facts, generate viral, high-retention YouTube Shorts metadata.

Subject: {subject}
Language: {language}

FACTS:
{facts_text}

Requirements for each Short:
1. Title:
   - Extremely punchy, curiosity-inducing hook under 55 characters.
   - Include 1-2 relevant emojis (🚨, 🤯, 😱, ⚡, ⚠️).
   - MUST end with "#Shorts" (e.g. "Did This Really Just Happen?! 😱 #Shorts", "They Finally Admitted It! 🚨 #Shorts").
2. Description:
   - 1 punchy sentence summarizing the shocking development.
   - Engagement question to trigger comment arguments/debate (e.g. "What would you do in this situation? 👇").
   - Call to action: "📺 Watch full 10-story breakdown on our channel!"
   - Viral hashtags: #shorts #youtubeshorts #trending #viral #breakingnews #{clean_subject_tag} #bytewire
3. Tags:
   - 10 to 14 high-volume shorts tags (shorts, youtubeshorts, viral, trending, news, breaking news, etc.).

Return ONLY a valid JSON array of {len(facts)} objects:
[
  {{
    "fact_index": 1,
    "title": "Shocking Development Revealed! 🚨 #Shorts",
    "description": "This is changing everything. What are your thoughts on this? Drop a comment below! 👇\\n\\n📺 Watch full breakdown on our channel!\\n\\n#shorts #youtubeshorts #trending #viral #breakingnews #bytewire",
    "tags": ["shorts", "youtubeshorts", "trending", "viral", "news", "breaking news", "bytewire"]
  }}
]
Do not wrap in markdown or explanation. Return JSON only.
"""
    print(f"[LOG] Running Gemini AI to generate viral metadata for {len(facts)} Shorts in 1 request...")
    try:
        raw = execute_gemini_with_retry(prompt)
        cleaned = clean_json_response(raw)
        data = json.loads(cleaned)
        if isinstance(data, list) and len(data) > 0:
            return data
    except Exception as e:
        print(f"[LOG] Warning: Failed to generate/parse shorts metadata JSON ({e}). Falling back to template metadata.")

    # Fallback template
    fallbacks = []
    for f in facts:
        idx = f.get("factIndex", 1)
        t = f.get("title", f"Fact {idx}").replace("*", "").strip()
        clean_tag = re.sub(r"[^a-zA-Z0-9]", "", subject)
        fallbacks.append({
            "fact_index": idx,
            "title": f"{t[:42]} 🚨 #Shorts",
            "description": f"{f.get('description', '')[:140]}\n\nWhat do you think about this? Let us know below! 👇\n\n📺 Watch the full breakdown on our channel!\n\n#shorts #youtubeshorts #trending #viral #news #{clean_tag} #bytewire",
            "tags": ["shorts", "youtubeshorts", "trending", "viral", "news", "breaking news", subject, f"story {idx}"]
        })
    return fallbacks

