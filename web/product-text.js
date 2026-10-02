// Preserve authored <br> and paragraph boundaries without rendering remote HTML.
export function productText(node) {
  const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'ADDRESS']);
  const walk = (item) => {
    if (item.nodeType === 3) return String(item.textContent || '').replace(/\s+/g, ' ');
    if (item.nodeName === 'BR') return '\n';
    const text = [...(item.childNodes || [])].map(walk).join('');
    return blockTags.has(item.nodeName) ? `\n${text}\n` : text;
  };
  return walk(node).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
