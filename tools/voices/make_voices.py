# Design the characters' Gemini voices (only the ones not designed yet). IDs go to tools/voices/voice_ids.json
# (gitignored), sample clips to ~/Downloads/lamshell-voices/.   GKEY=... python3 tools/voices/make_voices.py
import json, base64, os, sys, urllib.request
from voices_spec import VOICES
KEY = os.environ["GKEY"]
out_dir = os.path.expanduser("~/Downloads/lamshell-voices")
os.makedirs(out_dir, exist_ok=True)
ids_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice_ids.json")
ids = json.load(open(ids_path)) if os.path.exists(ids_path) else {}
for who, v in VOICES.items():
    if who in ids: continue
    body = {"store": True, "voice": {"type": "prompted", "prompted": {"input": v["input"]}, "display_name": v["display_name"],
            "language_code": "th-TH", "gender": v["gender"], "pitch": v["pitch"], "persona": v["persona"]}}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/voices", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": KEY}, method="POST")
    try:
        d = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        print(who, "HTTP", e.code, e.read().decode()[:400]); continue
    vid = d.get("id") or d.get("name")
    ids[who] = vid
    sa = d.get("sample_audio") or d.get("sampleAudio") or {}
    if sa.get("data"):
        open(f"{out_dir}/{who}.wav", "wb").write(base64.b64decode(sa["data"]))
    print(who, vid, sa.get("mime_type") or sa.get("mimeType"), "sample" if sa.get("data") else "no sample", d.get("usage"))
json.dump(ids, open(ids_path, "w"), indent=1)
