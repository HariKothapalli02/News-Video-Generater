"""
ByteWire AI - Telugu News End-to-End Gemini & Voiceover Test
Tests:
1. Live RSS scraping from the 4 Telugu feeds (NTV, TV9, Andhra Jyothy, V6 Velugu)
2. Gemini AI Top 10 viral news selection and complete Telugu TV broadcast scriptwriting
3. Microsoft Edge-TTS High-Pitch Male Voiceover (te-IN-MohanNeural, +25Hz, +5%)
(NO video rendering - Audio & Script generation test only)
"""

import asyncio
import os
import sys
import re
from dotenv import load_dotenv

# Ensure root .env is loaded
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# Import python-service modules
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "python-service"))

try:
    import rss
    import gemini
    import edge_tts
except ImportError as e:
    print(f"[!] Import error: {e}")
    print("    Ensure you have edge-tts installed: pip install edge-tts")
    sys.exit(1)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
os.makedirs(OUTPUT_DIR, exist_ok=True)


async def synthesize_edge_tts(text: str, output_path: str, voice="te-IN-MohanNeural", pitch="+25Hz", rate="+5%"):
    """
    Synthesizes the complete Top 10 news script via Microsoft Edge-TTS.
    """
    print(f"\n[+] Synthesizing Top 10 Audio via Edge-TTS (Voice: {voice}, Pitch: {pitch}, Rate: {rate})...")

    # Clean text of markdown asterisks
    clean_script = re.sub(r"[*#_`]", "", text)

    communicate = edge_tts.Communicate(
        text=clean_script,
        voice=voice,
        pitch=pitch,
        rate=rate
    )

    with open(output_path, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])

    file_size_kb = os.path.getsize(output_path) / 1024
    print(f"[✓] Complete Top 10 Voiceover Saved: {output_path} ({file_size_kb:.1f} KB)")


def main():
    print("=" * 70)
    print(" ByteWire AI - Live Telugu News Gemini & Voiceover Test Pipeline")
    print(" (Feeds: NTV, TV9, Andhra Jyothy, V6 Velugu | Engine: Gemini + Edge-TTS)")
    print("=" * 70)

    # 1. Scrape live news from the 4 Telugu feeds
    print("\n[Step 1/3] Scraping live news from 4 Telugu RSS Feeds in parallel...")
    candidate_items = rss.collect_news("telugu_news")
    if not candidate_items:
        print("[!] No candidate items returned from feeds. Falling back to trending feeds...")
        candidate_items = rss.collect_news("trending_news")

    print(f"[✓] Retrieved {len(candidate_items)} fresh news candidates from Telugu media outlets.")
    for i, itm in enumerate(candidate_items[:5], 1):
        print(f"    {i}. {itm.get('title')[:65]}... ({itm.get('source')})")

    # 2. Call Gemini AI to select Top 10 and generate complete broadcast script
    print("\n[Step 2/3] Calling Gemini AI to rank & select Top 10 stories with highest viral interest...")
    top_10_stories = gemini.select_top_10_news(
        candidate_items,
        subject="telugu news",
        video_type="telugu_news",
        count=10
    )
    print(f"[✓] Gemini selected {len(top_10_stories)} top stories.")

    print("\n[Step 2.1] Generating complete 10-Fact Telugu TV broadcast script via Gemini...")
    script_text = gemini.generate_script(
        news_items=top_10_stories,
        subject="telugu news",
        language="telugu",
        custom_prompt="సెలెక్ట్ చేసిన 4 న్యూస్ ఫీడ్స్ (NTV, TV9, ఆంధ్రజ్యోతి, V6 వెలుగు) నుంచి టాప్ 10 ముఖ్యమైన తాజా వార్తలతో తెలుగులో స్క్రిప్ట్ రాయండి. మొదటి 3 వార్తలు షార్ట్స్ కొరకు ఉపయోగించబడతాయి."
    )

    print("\n" + "=" * 70)
    print(" GENERATED TELUGU BROADCAST SCRIPT (ALL 10 FACTS):")
    print("=" * 70)
    print(script_text)
    print("=" * 70)

    # Save script to text file for inspection
    script_file = os.path.join(OUTPUT_DIR, "telugu_top10_script.txt")
    with open(script_file, "w", encoding="utf-8") as f:
        f.write(script_text)
    print(f"[i] Script saved to: {script_file}")

    # 3. Generate high-pitch Edge-TTS voiceover for all 10 facts
    print("\n[Step 3/3] Generating voiceover for all 10 facts using Microsoft Edge-TTS...")
    audio_output = os.path.join(OUTPUT_DIR, "telugu_top10_news_voice.mp3")

    asyncio.run(
        synthesize_edge_tts(
            text=script_text,
            output_path=audio_output,
            voice="te-IN-MohanNeural",
            pitch="+25Hz",
            rate="+5%"
        )
    )

    print("\n" + "=" * 70)
    print(" [TEST COMPLETED SUCCESSFULLY!]")
    print(f" 1. Telugu Script File:   {script_file}")
    print(f" 2. Top 10 Audio File:    {audio_output}")
    print("=" * 70)


if __name__ == "__main__":
    main()
