import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import html
import os

OUTPUT_FILE = r"D:\scripts\scriptfile.txt"
MAX_ITEMS = 30

# Fast, reliable news feeds with minimal blocking
FEEDS_TECH = [
    ("The Verge", "Technology", "https://www.theverge.com/rss/index.xml"),
    ("Ars Technica", "Technology", "https://feeds.arstechnica.com/arstechnica/index"),
    ("TechCrunch", "Technology", "https://techcrunch.com/feed/"),
    ("Wired", "Technology", "https://www.wired.com/feed/rss"),
    ("Engadget", "Technology", "https://www.engadget.com/rss.xml"),
    ("Google AI Blog", "AI", "https://blog.google/technology/ai/rss/"),
    ("NASA News", "Science", "https://www.nasa.gov/news-release/feed/"),
    ("BBC Technology", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
    ("CNBC Tech", "Technology", "https://www.cnbc.com/id/19854910/device/rss/rss.html"),
    ("Indian Express Tech", "Technology India", "https://indianexpress.com/section/technology/feed/"),
    ("Economic Times Tech", "Technology India", "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms"),
]

FEEDS_TRENDING = [
    ("Indian Express", "India", "https://indianexpress.com/section/india/feed/"),
    ("BBC World", "World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("The Hindu - National", "India", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("Times of India", "India", "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms"),
    ("NDTV India", "India", "https://feeds.feedburner.com/ndtvnews-india-news"),
    ("CNBC World News", "World", "https://www.cnbc.com/id/100727362/device/rss/rss.html"),
]

TRENDING_KEYWORDS = [
    "ai", "artificial intelligence", "openai", "google", "microsoft", "apple",
    "nvidia", "meta", "startup", "funding", "cyber", "security", "hack",
    "data breach", "robot", "chip", "semiconductor", "space", "nasa", "isro",
    "india", "election", "supreme court", "neet", "exam", "education",
    "market", "stock", "economy", "climate", "weather", "health", "medical",
    "breaking", "launch", "ban", "new", "major", "record"
]


def clean_text(text):
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_url(url, timeout=6):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def parse_date(text):
    if not text:
        return datetime.now(timezone.utc)

    try:
        dt = parsedate_to_datetime(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


def item_text(item, tag):
    value = item.findtext(tag)
    if value:
        return value

    for child in list(item):
        if child.tag.lower().endswith(tag.lower()):
            return child.text or ""

    return ""


def get_link(item):
    link = item_text(item, "link")
    if link:
        return clean_text(link)

    for child in list(item):
        if child.tag.lower().endswith("link"):
            return clean_text(child.attrib.get("href", "") or child.text or "")

    return ""


def score_item(title, description, category, published):
    combined = f"{title} {description} {category}".lower()
    score = 0

    for keyword in TRENDING_KEYWORDS:
        if keyword in combined:
            score += 4

    important_words = [
        "breaking", "live", "major", "urgent", "exclusive",
        "launch", "announces", "new", "record"
    ]

    if any(word in combined for word in important_words):
        score += 8

    age_hours = max(
        0,
        (datetime.now(timezone.utc) - published).total_seconds() / 3600
    )

    score += max(0, 48 - age_hours)

    if "technology" in category.lower() or "ai" in category.lower():
        score += 10

    if "india" in category.lower():
        score += 7

    return score


def fetch_single_feed(source, category, url):
    """
    Fetches and parses a single RSS feed with a strict 6-second timeout.
    """
    items_found = []
    try:
        xml_data = fetch_url(url, timeout=6)
        root = ET.fromstring(xml_data)

        items = root.findall(".//item")
        if not items:
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

        for item in items[:12]:
            title = clean_text(item_text(item, "title"))
            description = clean_text(
                item_text(item, "description")
                or item_text(item, "summary")
                or item_text(item, "content")
            )
            link = get_link(item)
            pub_raw = (
                item_text(item, "pubDate")
                or item_text(item, "updated")
                or item_text(item, "published")
            )
            published = parse_date(pub_raw)

            if title:
                items_found.append({
                    "title": title,
                    "description": description,
                    "link": link,
                    "source": source,
                    "category": category,
                    "published": published,
                    "score": score_item(title, description, category, published)
                })
    except Exception as error:
        print(f"[RSS Warning] Feed skipped: {source} ({error})")

    return items_found


def collect_news(video_type="tech_news"):
    all_items = []
    seen = set()

    feeds_to_use = FEEDS_TRENDING if video_type == "trending_news" else FEEDS_TECH

    print(f"[LOG] Fetching {len(feeds_to_use)} RSS feeds in parallel (timeout: 6s)...")
    
    # Run all feed fetches simultaneously in parallel threads
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_feed = {
            executor.submit(fetch_single_feed, source, category, url): (source, category)
            for source, category, url in feeds_to_use
        }

        for future in as_completed(future_to_feed):
            feed_items = future.result()
            for item in feed_items:
                key = re.sub(r"[^a-z0-9]+", "", item["title"].lower())[:80]
                if key and key not in seen:
                    seen.add(key)
                    all_items.append(item)

    all_items.sort(key=lambda item: item["score"], reverse=True)
    print(f"[LOG] Parallel RSS scrape completed. Found {len(all_items)} unique stories.")
    return all_items[:MAX_ITEMS]


def save_to_file(news_items):
    now = datetime.now().strftime("%d-%m-%Y %I:%M %p")
    lines = []
    lines.append("BYTEWIRE TRENDING NEWS SCRIPT FILE")
    lines.append(f"Generated: {now}")
    lines.append("=" * 80)

    for index, item in enumerate(news_items, start=1):
        published_time = item["published"].strftime("%d-%m-%Y %I:%M %p")
        lines.append(f"{index}. {item['title']}")
        lines.append(f"Category: {item['category']}")
        lines.append(f"Source: {item['source']}")
        lines.append(f"Published: {published_time}")
        if item["description"]:
            lines.append(f"Summary: {item['description'][:500]}")
        lines.append("-" * 80)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        file.write("\n".join(lines))


def main():
    news_items = collect_news()
    save_to_file(news_items)


if __name__ == "__main__":
    main()
