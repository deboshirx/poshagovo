import { CopyButton } from './ui';

// Маленький markdown: абзацы, списки, ```код```, **жирный**, `код`, [ссылка](url).
// Тащить целую библиотеку ради этого не хотелось, а dangerouslySetInnerHTML — тем более.

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;

function parseBlocks(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        items.push(lines[i].replace(LIST_ITEM, ''));
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !LIST_ITEM.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }

  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const safe = /^https?:\/\//.test(link[2]);
      return safe ? (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    return part;
  });
}

export default function Markdown({ text }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'code') {
          return (
            <div className="code-block" key={i}>
              <pre>
                <code>{b.text}</code>
              </pre>
              <CopyButton text={b.text} />
            </div>
          );
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </div>
  );
}
