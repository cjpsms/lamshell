// Collect every fixed spoken line: level intros/outros (levels.js) and cutscene lines (cutscene.js).
// Lines the game builds at runtime (hints with file names, AI replies) aren't here and stay text-only.
// Run: deno run --allow-read --allow-write tools/voices/extract_lines.mjs
const root = new URL('../../', import.meta.url);
const { LEVELS } = await import(new URL('static/js/levels.js', root));
const lines = [];
const add = (who, text, from) => { if (!lines.some(l => l.who === who && l.text === text)) lines.push({ who, text, from }); };
for (const lv of LEVELS) {
  for (const [who, t] of lv.intro || []) add(who, t, lv.id + ' intro');
  for (const [who, t] of lv.outro || []) add(who, t, lv.id + ' outro');
}
const cs = await Deno.readTextFile(new URL('static/js/cutscene.js', root));
for (const m of cs.matchAll(/S\.say\('(\w+)',\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1], m[2].replace(/\\'/g, "'"), 'cutscene');
await Deno.writeTextFile(new URL('tools/voices/lines.json', root), JSON.stringify(lines, null, 1));
const by = {};
for (const l of lines) by[l.who] = (by[l.who] || 0) + 1;
console.log(lines.length, 'lines', by);
