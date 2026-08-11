type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

export function extractPlainTextFromContentJson(
  doc: Record<string, unknown> | undefined,
): string {
  if (!doc) return '';
  const parts: string[] = [];

  function walk(node: JsonNode) {
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (node.type === 'mention') {
      const label = String(node.attrs?.label ?? node.attrs?.id ?? '');
      if (label) parts.push(label.startsWith('@') ? label : `@${label}`);
    }
    if (node.type === 'hardBreak') parts.push('\n');
    if (node.content) node.content.forEach(walk);
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'blockquote' ||
      node.type === 'listItem' ||
      node.type === 'codeBlock'
    ) {
      parts.push('\n');
    }
  }

  walk(doc as JsonNode);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractMentionIdsFromContentJson(
  doc: Record<string, unknown> | undefined,
): string[] {
  if (!doc) return [];
  const ids = new Set<string>();

  function walk(node: JsonNode) {
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') {
      ids.add(node.attrs.id);
    }
    node.content?.forEach(walk);
  }

  walk(doc as JsonNode);
  return [...ids];
}

export function isAllowedContentJson(doc: unknown): doc is Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return false;
  const root = doc as JsonNode;
  if (root.type !== 'doc') return false;
  const allowed = new Set([
    'doc',
    'paragraph',
    'text',
    'hardBreak',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'codeBlock',
    'heading',
    'mention',
    'horizontalRule',
  ]);
  let ok = true;
  function walk(node: JsonNode) {
    if (node.type && !allowed.has(node.type)) ok = false;
    node.content?.forEach(walk);
  }
  walk(root);
  return ok;
}
