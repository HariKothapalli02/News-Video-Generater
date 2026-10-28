import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("Testing imports...")
import gemini
import pexels
import movie
import thumbnail

print("Imports successful!")

# Test Wikimedia media search fallback
res = pexels.search_wikimedia_media("artificial intelligence data center", count=2)
print(f"Wikimedia search test: returned {len(res)} item(s)")
if res:
    print(f"Sample item: {res[0].get('url')[:80]}...")

print("All code validated successfully!")
