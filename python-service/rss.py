import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import html
import os

OUTPUT_FILE = r"D:\scripts\scriptfile.txt"
MAX_CANDIDATE_ITEMS = 40

# Top-Tier Verified Technology Feeds (Global & India Tech)
FEEDS_TECH = [
    ("Google News - Technology", "Technology", "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en"),
    ("TechCrunch", "Technology", "https://techcrunch.com/feed/"),
    ("The Verge", "Technology", "https://www.theverge.com/rss/index.xml"),
    ("Wired", "Technology", "https://www.wired.com/feed/rss"),
    ("Ars Technica", "Technology", "https://feeds.arstechnica.com/arstechnica/index"),
    ("Engadget", "Technology", "https://www.engadget.com/rss.xml"),
    ("Hacker News", "Technology", "https://news.ycombinator.com/rss"),
    ("BBC Technology", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
    ("CNBC Tech", "Technology", "https://www.cnbc.com/id/19854910/device/rss/rss.html"),
    ("Indian Express Tech", "Technology India", "https://indianexpress.com/section/technology/feed/"),
    ("Economic Times Tech", "Technology India", "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms"),
    ("Google AI Blog", "AI", "https://blog.google/technology/ai/rss/"),
    ("NASA News", "Science & Space", "https://www.nasa.gov/news-release/feed/"),
]

# Top-Tier Verified Indian General News Feeds (Politics, Issues, National Breaking, Courts, Governance)
FEEDS_INDIA_GENERAL = [
    ("Google News - India Breaking", "India National", "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"),
    ("Google News - India National", "India Politics", "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRE55YXpBU0FtVnpLQUFQAQ?hl=en-IN&gl=IN&ceid=IN%3Aen"),
    ("The Hindu - National", "India National", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("Indian Express - India", "India National", "https://indianexpress.com/section/india/feed/"),
    ("Indian Express - Political Pulse", "India Politics", "https://indianexpress.com/section/political-pulse/feed/"),
    ("NDTV - Top Stories", "India National", "https://feeds.feedburner.com/ndtvnews-top-stories"),
    ("NDTV - India News", "India National", "https://feeds.feedburner.com/ndtvnews-india-news"),
    ("Times of India - Top Stories", "India Breaking", "https://timesofindia.indiatimes.com/rssfeedstopstories.cms"),
    ("Times of India - India News", "India National", "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms"),
    ("Livemint - Politics", "India Politics", "https://www.livemint.com/rss/politics"),
    ("Livemint - National News", "India Policy & Economy", "https://www.livemint.com/rss/news"),
    ("Economic Times - Politics & Nation", "India Politics", "https://economictimes.indiatimes.com/news/politics-and-nation/rssfeeds/1052732854.cms"),
    ("BBC - India News", "India National", "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml"),
]

# Top-Tier Trending Feeds (Viral National & Global News)
FEEDS_TRENDING = [
    ("Google News - India Trending", "India Trending", "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"),
    ("Indian Express - India", "India", "https://indianexpress.com/section/india/feed/"),
    ("The Hindu - National", "India", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("NDTV - Top Stories", "India", "https://feeds.feedburner.com/ndtvnews-top-stories"),
    ("BBC World", "World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("CNBC World News", "World", "https://www.cnbc.com/id/100727362/device/rss/rss.html"),
    ("Times of India - Top Stories", "India", "https://timesofindia.indiatimes.com/rssfeedstopstories.cms"),
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

        for item in items[:15]:
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

            if title and len(title) > 8:
                items_found.append({
                    "title": title,
                    "description": description,
                    "link": link,
                    "source": source,
                    "category": category,
                    "published": published
                })
    except Exception as error:
        print(f"[RSS Warning] Feed skipped: {source} ({error})")

    return items_found


def collect_news(video_type="tech_news"):
    all_items = []
    seen = set()

    # Determine feed group
    vt = (video_type or "").lower()
    if vt in ["india_general_news", "indian_general_news", "india_news", "political_news"]:
        feeds_to_use = FEEDS_INDIA_GENERAL
        feed_label = "India General & Political News"
    elif vt == "trending_news":
        feeds_to_use = FEEDS_TRENDING
        feed_label = "Trending Viral News"
    else:
        feeds_to_use = FEEDS_TECH
        feed_label = "Technology & AI News"

    print(f"[LOG] Fetching {len(feeds_to_use)} RSS feeds for '{feed_label}' in parallel (timeout: 6s)...")

    # Run all feed fetches simultaneously in parallel threads
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_feed = {
            executor.submit(fetch_single_feed, source, category, url): (source, category)
            for source, category, url in feeds_to_use
        }

        for future in as_completed(future_to_feed):
            feed_items = future.result()
            for item in feed_items:
                # Deduplicate by first 70 clean alphanumeric characters of the title
                key = re.sub(r"[^a-z0-9]+", "", item["title"].lower())[:70]
                if key and key not in seen:
                    seen.add(key)
                    all_items.append(item)

    # Sort strictly by publication date (freshest breaking news first)
    all_items.sort(key=lambda item: item["published"], reverse=True)
    print(f"[LOG] Parallel RSS scrape completed. Found {len(all_items)} fresh unique stories.")
    return all_items[:MAX_CANDIDATE_ITEMS]


def save_to_file(news_items):
    now = datetime.now().strftime("%d-%m-%Y %I:%M %p")
    lines = []
    lines.append("BYTEWIRE NEWS SCRIPT CANDIDATE FILE")
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
    news_items = collect_news("india_general_news")
    save_to_file(news_items)
    print(f"Saved {len(news_items)} news items to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
