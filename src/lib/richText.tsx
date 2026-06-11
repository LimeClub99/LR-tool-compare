import { Fragment, ReactNode } from 'react';

// A deliberately tiny markup subset, shared by the metric write-ups in the
// Analysis panel and the PDF report so config.ts stays the single source of
// truth. Two features only, both there to add genuine structure (not emphasis):
//
//   **bold**                -> <strong>. Reserved for the label in a list row;
//                              avoid sprinkling it through running prose.
//   - **Label** explanation -> a scannable definition list (label | meaning).
//                              A blank line separates blocks; a block whose
//                              every line starts with "- " becomes the list.

/** Drop the **bold** markers, for places that want the raw sentence (e.g. a
 *  one-line glossary summary) rather than rendered emphasis. */
export function stripMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

function renderInline(text: string): ReactNode {
  // Split on **...** while keeping the delimiters, then unwrap the bold runs.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i}>{m[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}

interface Props {
  text: string;
  /** Class applied to each <p> (e.g. 'metric-technical' to mute the tech tier). */
  pClassName?: string;
}

export function RichText({ text, pClassName }: Props) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const isList = lines.length > 0 && lines.every((l) => l.startsWith('- '));

        if (isList) {
          return (
            <dl className="rich-deflist" key={bi}>
              {lines.map((line, li) => {
                const body = line.slice(2);
                // "**Label** rest" splits into a label and its meaning; the
                // visual gap is the separator, so no dash is needed. Anything
                // else is rendered as a plain row.
                const m = body.match(/^\*\*([^*]+)\*\*\s*(.*)$/);
                return m ? (
                  <div key={li}>
                    <dt>{m[1]}</dt>
                    <dd>{renderInline(m[2])}</dd>
                  </div>
                ) : (
                  <div key={li}>
                    <dd>{renderInline(body)}</dd>
                  </div>
                );
              })}
            </dl>
          );
        }

        return (
          <p key={bi} className={pClassName}>
            {renderInline(block)}
          </p>
        );
      })}
    </>
  );
}
