#!/usr/bin/env python3
"""Voice every fixed line with ElevenLabs (eleven_v3, Thai), one request per line -- no cutting needed.

Lines go in game order (lines.json), so if the monthly credits run out it's the late lines that stay text.
Before each line the remaining credits are checked; the run stops instead of going over.
Files: static/voice/<who>/<key>.mp3, listed in static/voice/manifest.json as {src, ms} (same key as tts_build.py).

  XI_KEY=... python3 tools/voices/tts_eleven.py        # key only from the environment
"""
import json, os, subprocess, sys, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts_build import ROOT, HERE, OUT, key, speakable, duration, load_manifest, save_manifest

KEY = os.environ.get('XI_KEY') or sys.exit('set XI_KEY')
MODEL = 'eleven_v3'
VOICES = json.load(open(os.path.join(HERE, 'eleven_voices.json')))


def api(path, body=None, raw=False):
    req = urllib.request.Request('https://api.elevenlabs.io' + path, data=json.dumps(body).encode() if body else None,
                                 method='POST' if body else 'GET',
                                 headers={'Content-Type': 'application/json', 'xi-api-key': KEY})
    r = urllib.request.urlopen(req, timeout=180)
    return r.read() if raw else json.load(r)


def credits_left():
    s = api('/v1/user/subscription')
    return s['character_limit'] - s['character_count']


def main():
    lines = [l for l in json.load(open(os.path.join(HERE, 'lines.json'))) if l['who'] in VOICES]
    manifest = load_manifest()
    todo = [l for l in lines if not manifest.get(key(l['who'], l['text']), {}).get('src', '').endswith('.mp3')]
    left = credits_left()
    print(f'{len(todo)} lines to voice, {sum(len(speakable(l["text"])) for l in todo)} characters; {left} credits left')
    done = 0
    for l in todo:
        text = speakable(l['text'])
        if len(text) > left:
            print(f'stopping: next line needs {len(text)}, only {left} credits left (resets monthly)'); break
        try:
            audio = api(f'/v1/text-to-speech/{VOICES[l["who"]]}?output_format=mp3_44100_64', {'text': text, 'model_id': MODEL}, raw=True)
        except urllib.error.HTTPError as e:
            print(f'  {l["from"]}: HTTP {e.code} {e.read().decode()[:200]}'); break
        k = key(l['who'], l['text'])
        dest = os.path.join(OUT, l['who'], k + '.mp3')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'wb').write(audio)
        manifest[k] = {'src': f'voice/{l["who"]}/{k}.mp3', 'ms': round(duration(dest) * 1000)}
        save_manifest(manifest)
        left -= len(text)
        done += 1
        if done % 10 == 0:
            left = credits_left()
            print(f'  {done} lines done, {left} credits left')
    print(f'done: {done} lines voiced, {credits_left()} credits left')


if __name__ == '__main__':
    main()
