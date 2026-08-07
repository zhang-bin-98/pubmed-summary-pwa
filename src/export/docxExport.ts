import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { decodeNumericEntities } from '../domain/text';

export interface DocxReviewInput {
  title: string;
  markdown: string;
  references: string[];
}

function paragraphsFromMarkdown(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let textLines: string[] = [];
  const flushText = () => {
    if (textLines.length > 0) {
      paragraphs.push(new Paragraph({ children: [new TextRun(textLines.join('\n'))] }));
      textLines = [];
    }
  };
  for (const line of decodeNumericEntities(markdown).replaceAll('\r\n', '\n').split('\n')) {
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flushText();
      paragraphs.push(new Paragraph({ text: heading[2], heading: heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 }));
    } else if (line.trim() === '') {
      flushText();
    } else {
      textLines.push(line);
    }
  }
  flushText();
  return paragraphs;
}

export async function buildDocxBlob(input: DocxReviewInput): Promise<Blob> {
  const children: Paragraph[] = [new Paragraph({ text: decodeNumericEntities(input.title), heading: HeadingLevel.TITLE })];
  children.push(...paragraphsFromMarkdown(input.markdown));
  if (input.references.length > 0) {
    children.push(new Paragraph({ text: '参考文献', heading: HeadingLevel.HEADING_1 }));
    children.push(...input.references.map((reference, index) => new Paragraph({ text: `${index + 1}. ${decodeNumericEntities(reference)}` })));
  }
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

export function sanitizeDocxFileName(title: string, date: string): string {
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim() || 'PubMed综述';
  return `${safeTitle}-${date}.docx`;
}
