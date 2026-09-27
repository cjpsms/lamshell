#!/usr/bin/env python3
"""Voice every fixed line of the game with the characters' designed Gemini voices.

Several lines of one character go into one request, joined by <long pause>; the audio is cut back into one file per
line. Where each line should end is estimated from its share of the characters, the pause nearest each spot is
used, and every piece must be spoken at a sane speed -- otherwise the batch is retried as two smaller ones. The
uncut audio of every request is kept in tools/voices/raw/, and each finished batch goes into
static/voice/manifest.json right away, so a run that hits the daily free quota just continues tomorrow.

  deno run --allow-read --allow-write tools/voices/extract_lines.mjs     # refresh lines.json
  GKEY=... python3 tools/voices/tts_build.py [--who serv]                  # key only from the environment
  python3 tools/voices/tts_build.py --check                               # re-check existing files, drop bad ones
"""
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, 'tools', 'voices')
OUT = os.path.join(ROOT, 'static', 'voice')
MANIFEST = os.path.join(OUT, 'manifest.json')
RAW = os.path.join(HERE, 'raw')   # uncut audio of every request (gitignored)
MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']   # cheapest first; next one when its daily quota is used
BATCH = 5         # more lines per request saves quota, but long batches get cut wrong more often
GAP = 21          # seconds between requests (free tier: 3 requests per minute)
SPEED = (0.6, 1.6)   # a piece's characters/second must be within this factor of its batch's
KEY = os.environ.get('GKEY')


def key(who, text):
    """FNV-1a 32-bit of 'who\\ntext' (UTF-8), as 8 hex digits. voice.js computes the same to find the file."""
    h = 0x811c9dc5
    for b in f'{who}\n{text}'.encode():
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return f'{h:08x}'


EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿️]')
def speakable(text):
    """What gets read out: no emoji, no stage directions like "(เสียงแหบ)", and no "..." (a long pause inside a line
    looks just like the pause between lines, and the cut lands mid-sentence)."""
    t = EMOJI.sub('', text)
    t = re.sub(r'^\([^)]*\)\s*', '', t)
    t = re.sub(r'\.{2,}|…', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def weight(text):
    return max(1, len(speakable(text).replace(' ', '')))


def tts(model, text, voice):
    body = {'contents': [{'parts': [{'text': text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'voice': voice}}}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                                 data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
    d = json.load(urllib.request.urlopen(req, timeout=180))
    return base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def silences(wav):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', err)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', err)]
    return list(zip(starts, ends))


def split(wav, texts):
    """Cut points for these lines, or None if the audio doesn't split cleanly."""
    n, total = len(texts), duration(wav)
    if not total:
        return None
    w = [weight(t) for t in texts]
    cuts = [0.0]
    if n > 1:
        gaps = [g for g in silences(wav) if g[0] > 0.2]
        used = -1
        for i in range(1, n):
            expect = total * sum(w[:i]) / sum(w)
            options = [(abs((a + b) / 2 - expect), j) for j, (a, b) in enumerate(gaps) if j > used]
            if not options:
                return None
            _, used = min(options)
            cuts.append(sum(gaps[used]) / 2)
    cuts.append(total)
    rate = sum(w) / total
    for i in range(n):
        if not SPEED[0] * rate <= w[i] / max(0.05, cuts[i + 1] - cuts[i]) <= SPEED[1] * rate:
            return None
    return cuts


def encode(wav, start, end, dest):
    trim = 'silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ss', f'{start:.3f}', '-to', f'{end:.3f}',
                    '-af', trim, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', dest], check=True)
    return round(duration(dest) * 1000)


def load_manifest():
    return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}


def save_manifest(m):
    os.makedirs(OUT, exist_ok=True)
    json.dump(m, open(MANIFEST, 'w'), indent=0)


def check():
    """Drop files that are unreadable or spoken at an odd speed for their text (a bad cut from older builds)."""
    lines = {key(l['who'], l['text']): l for l in json.load(open(os.path.join(HERE, 'lines.json')))}
    m = load_manifest()
    rates = {}
    for k, v in m.items():
        src = v if isinstance(v, str) else v['src']
        d = duration(os.path.join(ROOT, 'static', src))
        if k in lines and d:
            rates[k] = weight(lines[k]['text']) / d
    med = sorted(rates.values())[len(rates) // 2] if rates else 0
    bad = [k for k in m if k not in rates or not SPEED[0] * med <= rates[k] <= SPEED[1] * med]
    for k in bad:
        src = m[k] if isinstance(m[k], str) else m[k]['src']
        try:
            os.remove(os.path.join(ROOT, 'static', src))
        except OSError:
            pass
        del m[k]
    for k, v in m.items():
        if isinstance(v, str):
            m[k] = {'src': v, 'ms': round(duration(os.path.join(ROOT, 'static', v)) * 1000)}
    save_manifest(m)
    print(f'{len(bad)} bad files removed, {len(m)} kept (median {med:.1f} chars/s)')


def main():
    if not KEY:
        sys.exit('set GKEY')
    lines = json.load(open(os.path.join(HERE, 'lines.json')))
    voices = json.load(open(os.path.join(HERE, 'voice_ids.json')))
    manifest = load_manifest()
    only = sys.argv[sys.argv.index('--who') + 1] if '--who' in sys.argv else None   # e.g. --who serv
    todo = [l for l in lines if key(l['who'], l['text']) not in manifest and l['who'] in voices and (not only or l['who'] == only)]
    batches = []
    for who in dict.fromkeys(l['who'] for l in todo):
        mine = [l for l in todo if l['who'] == who]
        batches += [mine[i:i + BATCH] for i in range(0, len(mine), BATCH)]
    print(f'{len(todo)} lines to voice in {len(batches)} requests')
    models = list(MODELS)
    while batches and models:
        batch = batches.pop(0)
        who = batch[0]['who']
        raw = os.path.join(RAW, '-'.join(key(l['who'], l['text']) for l in batch) + '.wav')
        if not os.path.exists(raw):
            try:
                audio = tts(models[0], ' <long pause> '.join(speakable(l['text']) for l in batch), voices[who])
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print(f'  {models[0]}: daily quota used up, next model')
                    models.pop(0); batches.insert(0, batch); continue
                print(f'  {who}: HTTP {e.code} {e.read().decode()[:300]}')
                batches.insert(0, batch); break
            os.makedirs(RAW, exist_ok=True)
            open(raw, 'wb').write(audio)
            requested = True
        else:
            requested = False   # already have this batch's audio from an earlier run
        cuts = split(raw, [l['text'] for l in batch])
        if not cuts:
            if len(batch) > 1:
                half = len(batch) // 2
                print(f'  {who}: {len(batch)} lines did not cut cleanly, retrying as {half} + {len(batch) - half}')
                batches[:0] = [batch[:half], batch[half:]]
            else:
                print(f'  {who}: could not voice "{batch[0]["text"][:30]}", skipped (stays text)')
        else:
            os.makedirs(os.path.join(OUT, who), exist_ok=True)
            for i, l in enumerate(batch):
                k = key(l['who'], l['text'])
                ms = encode(raw, cuts[i], cuts[i + 1], os.path.join(OUT, who, k + '.ogg'))
                manifest[k] = {'src': f'voice/{who}/{k}.ogg', 'ms': ms}
            save_manifest(manifest)
            print(f'  {who}: {len(batch)} lines ok ({models[0]}), {len(batches)} requests left')
        if batches and requested:
            time.sleep(GAP)
    left = sum(len(b) for b in batches)
    print('done' if not left else f'stopped with {left} lines left: run again later (the quota resets about 14:00 Thai time)')


if __name__ == '__main__':
    check() if '--check' in sys.argv else main()
