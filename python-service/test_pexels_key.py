import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
api_key = os.getenv("PEXELS_API_KEY")

print(f"Testing PEXELS_API_KEY: {api_key[:6]}...{api_key[-4:] if api_key else 'None'}")
res = requests.get(
    "https://api.pexels.com/videos/search?query=news&per_page=1",
    headers={"Authorization": api_key}
)
print(f"Status Code: {res.status_code}")
print(f"Response: {res.text[:200]}")
