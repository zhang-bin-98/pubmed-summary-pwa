import { expect, it } from 'vitest';
import { buildDocxBlob, sanitizeDocxFileName } from './docxExport';

it('builds a docx and a Windows-safe file name', async () => {
  const blob = await buildDocxBlob({ title: '标题', markdown: '## 1. 引言\n\n正文[1]。', references: ['Wang L. Title. Ex J. 2026. PMID: 1'] });
  expect(blob.type).toContain('officedocument.wordprocessingml.document');
  expect(blob.size).toBeGreaterThan(1000);
  expect(sanitizeDocxFileName('A:B?C', '2026-08-07')).toBe('A_B_C-2026-08-07.docx');
});
