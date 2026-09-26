import json, base64, os, sys, urllib.request
from voices_spec import VOICES
KEY = os.environ["GKEY"]
out_dir = os.path.expanduser("~/Downloads/lamshell-voices")
ids = json.load(open(f"{out_dir}/voice_ids.json")) if os.path.exists(f"{out_dir}/voice_ids.json") else {}
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
json.dump(ids, open(f"{out_dir}/voice_ids.json", "w"), indent=1)
