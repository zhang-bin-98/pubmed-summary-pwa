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
