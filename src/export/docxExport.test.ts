import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocxBlob, sanitizeDocxFileName } from './docxExport';

it('builds a docx and a Windows-safe file name', async () => {
  const blob = await buildDocxBlob({ title: '标题', markdown: '## 1. 引言\n\n正文[1]。', references: ['Wang L. Title. Ex J. 2026. PMID: 1'] });
  expect(blob.type).toContain('officedocument.wordprocessingml.document');
  expect(blob.size).toBeGreaterThan(1000);
  expect(sanitizeDocxFileName('A:B?C', '2026-08-07')).toBe('A_B_C-2026-08-07.docx');
});

it('exports old numeric entities as Unicode in a complete Word package', async () => {
  const references = Array.from({ length: 95 }, (_, index) => index === 0
    ? 'C&#x105;ka&#x142;a-Jakimowicz M. Spleen aging. PMID: 1'
    : `Author ${index + 1}. Reference ${index + 1}. PMID: ${index + 1}`);
  const blob = await buildDocxBlob({ title: '脾脏衰老', markdown: '## 引言\n\n正文[1]。', references });

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');

  expect(documentXml).toBeDefined();
  expect(documentXml).toContain('脾脏衰老');
  expect(documentXml).toContain('Cąkała-Jakimowicz');
  expect(documentXml).toContain('95. Author 95. Reference 95. PMID: 95');
  expect(documentXml).not.toContain('&amp;#x105;');
});

it('leaves XML-invalid numeric entities as escaped text', async () => {
  const blob = await buildDocxBlob({ title: 'Title', markdown: 'Body', references: ['Unsafe &#0; and &#xD800;'] });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');

  expect(documentXml).toContain('Unsafe &amp;#0; and &amp;#xD800;');
  expect(documentXml).not.toContain('\u0000');
  expect(documentXml).not.toContain('\uFFFD');
});

it('applies readable body spacing and first-line indentation', async () => {
  const blob = await buildDocxBlob({ title: 'Title', markdown: '## 引言\n\n第一段正文。\n\n第二段正文。', references: ['Reference'] });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const stylesXml = await zip.file('word/styles.xml')?.async('string');

  expect(stylesXml).toContain('<w:style w:type="paragraph" w:styleId="ReviewBody">');
  expect(stylesXml).toContain('<w:spacing w:after="120" w:line="360" w:lineRule="auto"/>');
  expect(stylesXml).toContain('<w:ind w:firstLine="480"/>');
  expect(stylesXml).toMatch(/<w:style w:type="paragraph" w:styleId="ReviewReference">[\s\S]*?<w:spacing w:after="80" w:line="300" w:lineRule="auto"\/>[\s\S]*?<\/w:style>/);
});

it('uses editable Word multilevel numbering with restrained heading sizes', async () => {
  const blob = await buildDocxBlob({
    title: 'Title',
    markdown: '## 1. 引言\n\n### 1.1 研究背景\n\n#### 1.1.1 关键问题\n\n## 2. 方法',
    references: [],
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');
  const stylesXml = await zip.file('word/styles.xml')?.async('string');

  expect(documentXml).toContain('<w:pStyle w:val="ReviewHeading1"/>');
  expect(documentXml).toContain('<w:pStyle w:val="ReviewHeading2"/>');
  expect(documentXml).toContain('<w:pStyle w:val="ReviewHeading3"/>');
  expect(documentXml).toContain('<w:ilvl w:val="0"/>');
  expect(documentXml).toContain('<w:ilvl w:val="1"/>');
  expect(documentXml).toContain('<w:ilvl w:val="2"/>');
  expect(documentXml).not.toContain('1. 引言');
  expect(numberingXml).toContain('<w:lvlText w:val="%1."/>');
  expect(numberingXml).toContain('<w:lvlText w:val="%1.%2"/>');
  expect(numberingXml).toContain('<w:lvlText w:val="%1.%2.%3"/>');
  expect(stylesXml).toContain('<w:sz w:val="30"/>');
  expect(stylesXml).toContain('<w:sz w:val="26"/>');
  expect(stylesXml).toContain('<w:sz w:val="24"/>');
});
