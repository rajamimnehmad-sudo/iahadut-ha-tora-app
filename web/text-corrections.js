import defaults from './data/text-corrections.json' with {type:'json'};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let lastRules, replacements;
export function correctDisplayText(value, rules = defaults) {
  const original = String(value ?? '');
  // Identifiers, URLs, barcodes and technical keys must remain identical.
  if (/^(?:https?:|data:|blob:|file:|mailto:)/i.test(original)) return original;
  if (lastRules !== rules) {
    lastRules = rules;
    replacements = Object.entries(rules).sort(([a],[b])=>b.length-a.length).map(([from,to])=>[new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(from)}(?![\\p{L}\\p{N}_])`,from === 'MErmelada' ? 'gu' : 'giu'),to]);
  }
  let text = original.normalize('NFC');
  for(const [pattern,to] of replacements) text=text.replace(pattern,match=>match===match.toUpperCase() ? to.toUpperCase() : /^\p{Lu}/u.test(match) && !/^\p{Lu}/u.test(to) ? to[0].toUpperCase()+to.slice(1) : to);
  return text;
}
export function correctContentTree(value, rules = defaults, key = '') {
  if(typeof value==='string') return /^(?:url|sourceUrl|image|imageUrl|barcode|sourceFingerprint|generatedAt|version|checkedAt|hash|snapshot|file|categoryPath|cat|key|section|type)$/i.test(key) ? value : correctDisplayText(value,rules);
  if(Array.isArray(value)) return value.map(item=>correctContentTree(item,rules,key));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,correctContentTree(item,rules,name)]));
  return value;
}
