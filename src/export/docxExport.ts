import {
  AlignmentType,
  Document,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { decodeNumericEntities } from '../domain/text';

export interface DocxReviewInput {
  title: string;
  markdown: string;
  references: string[];
}

const BODY_STYLE = 'ReviewBody';
const HEADING_STYLES = ['ReviewHeading1', 'ReviewHeading2', 'ReviewHeading3'] as const;
const REFERENCE_HEADING_STYLE = 'ReviewReferenceHeading';
const REFERENCE_STYLE = 'ReviewReference';
const TITLE_STYLE = 'ReviewTitle';
const HEADING_NUMBERING = 'review-headings';

function normalizeHeadingText(value: string): string {
  return value.trim().replace(/^\d+(?:\.\d+){0,2}\.?\s+/, '');
}

function paragraphsFromMarkdown(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let textLines: string[] = [];
  const flushText = () => {
    if (textLines.length > 0) {
      paragraphs.push(new Paragraph({
        children: [new TextRun(textLines.join('\n'))],
        style: BODY_STYLE,
      }));
      textLines = [];
    }
  };

  for (const line of decodeNumericEntities(markdown).replaceAll('\r\n', '\n').split('\n')) {
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushText();
      const level = heading[1].length - 2;
      paragraphs.push(new Paragraph({
        text: normalizeHeadingText(heading[2]),
        style: HEADING_STYLES[level],
        numbering: { reference: HEADING_NUMBERING, level },
      }));
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
  const children: Paragraph[] = [new Paragraph({
    text: decodeNumericEntities(input.title),
    style: TITLE_STYLE,
  })];
  children.push(...paragraphsFromMarkdown(input.markdown));
  if (input.references.length > 0) {
    children.push(new Paragraph({ text: '参考文献', style: REFERENCE_HEADING_STYLE }));
    children.push(...input.references.map((reference, index) => new Paragraph({
      text: `${index + 1}. ${decodeNumericEntities(reference)}`,
      style: REFERENCE_STYLE,
    })));
  }

  return Packer.toBlob(new Document({
    numbering: {
      config: [{
        reference: HEADING_NUMBERING,
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            suffix: LevelSuffix.SPACE,
            style: { paragraph: { indent: { left: 0, hanging: 0 } } },
          },
          {
            level: 1,
            format: LevelFormat.DECIMAL,
            text: '%1.%2',
            suffix: LevelSuffix.SPACE,
            style: { paragraph: { indent: { left: 0, hanging: 0 } } },
          },
          {
            level: 2,
            format: LevelFormat.DECIMAL,
            text: '%1.%2.%3',
            suffix: LevelSuffix.SPACE,
            style: { paragraph: { indent: { left: 0, hanging: 0 } } },
          },
        ],
      }],
    },
    styles: {
      paragraphStyles: [
        {
          id: TITLE_STYLE,
          name: 'Review Title',
          basedOn: 'Title',
          next: BODY_STYLE,
          quickFormat: true,
          run: { bold: true, size: 32 },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240, line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: BODY_STYLE,
          name: 'Review Body',
          basedOn: 'Normal',
          next: BODY_STYLE,
          quickFormat: true,
          run: { size: 24 },
          paragraph: {
            spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO },
            indent: { firstLine: 480 },
          },
        },
        {
          id: HEADING_STYLES[0],
          name: 'Review Heading 1',
          basedOn: 'Heading1',
          next: BODY_STYLE,
          quickFormat: true,
          run: { bold: true, size: 30 },
          paragraph: {
            keepNext: true,
            outlineLevel: 0,
            spacing: { before: 300, after: 120, line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: HEADING_STYLES[1],
          name: 'Review Heading 2',
          basedOn: 'Heading2',
          next: BODY_STYLE,
          quickFormat: true,
          run: { bold: true, size: 26 },
          paragraph: {
            keepNext: true,
            outlineLevel: 1,
            spacing: { before: 240, after: 100, line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: HEADING_STYLES[2],
          name: 'Review Heading 3',
          basedOn: 'Heading3',
          next: BODY_STYLE,
          quickFormat: true,
          run: { bold: true, size: 24 },
          paragraph: {
            keepNext: true,
            outlineLevel: 2,
            spacing: { before: 180, after: 80, line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: REFERENCE_HEADING_STYLE,
          name: 'Review Reference Heading',
          basedOn: 'Heading1',
          next: REFERENCE_STYLE,
          quickFormat: true,
          run: { bold: true, size: 30 },
          paragraph: {
            keepNext: true,
            outlineLevel: 0,
            spacing: { before: 360, after: 120, line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: REFERENCE_STYLE,
          name: 'Review Reference',
          basedOn: 'Normal',
          next: REFERENCE_STYLE,
          quickFormat: true,
          run: { size: 20 },
          paragraph: {
            spacing: { after: 80, line: 300, lineRule: LineRuleType.AUTO },
          },
        },
      ],
    },
    sections: [{ children }],
  }));
}

export function sanitizeDocxFileName(title: string, date: string): string {
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim() || 'PubMed综述';
  return `${safeTitle}-${date}.docx`;
}
