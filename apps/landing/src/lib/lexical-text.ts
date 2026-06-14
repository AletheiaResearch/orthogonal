type LexicalNode = {
  type?: string;
  text?: string;
  children?: LexicalNode[];
};

/**
 * Depth-first collect of all text-node strings under a Lexical editor state.
 * Accepts `unknown` so it composes with Payload's generated richText field type.
 */
export function lexicalToPlainText(state: unknown): string {
  const root = (state as { root?: LexicalNode } | null | undefined)?.root;
  if (!root?.children) return "";
  const parts: string[] = [];
  const walk = (node: LexicalNode) => {
    if (typeof node.text === "string") parts.push(node.text);
    node.children?.forEach(walk);
  };
  // Join block-level children with a space so words don't run together.
  root.children.forEach((block) => {
    const before = parts.length;
    walk(block);
    if (parts.length > before) parts.push(" ");
  });
  return parts.join("").replace(/\s+/g, " ").trim();
}
