import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArticlesCsv, buildRunJson, canShareFiles, downloadBlob, shareBlob, shareOrDownloadBlob } from './dataExport';

it('never exports API keys', () => {
  const json = buildRunJson({ run: { id: 'r', topic: '主题' }, articles: [], screening: [], artifact: {} });
  expect(json).not.toContain('deepSeekApiKey');
  expect(json).not.toContain('ncbiApiKey');
});

it('escapes commas and quotes in CSV', () => {
  expect(buildArticlesCsv([{ pmid: '1', title: 'A, "B"', journal: 'J', publicationDate: '2026', included: true, score: 3, reason: '相关' }]))
    .toContain('"A, ""B"""');
});

it('keeps the object URL alive until the browser starts the download', () => {
  vi.useFakeTimers();
  const anchor = document.createElement('a');
  const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
  const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  downloadBlob(new Blob(['docx']), 'review.docx');

  expect(click).toHaveBeenCalledOnce();
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

  createElement.mockRestore();
  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
  click.mockRestore();
  vi.useRealTimers();
});

describe('shareBlob', () => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  afterEach(() => {
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  it('hands the file to the system share sheet', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    await expect(shareBlob(new Blob(['docx'], { type: DOCX_MIME }), '综述.docx', '综述')).resolves.toBe('shared');

    expect(share).toHaveBeenCalledOnce();
    const data = share.mock.calls[0][0];
    expect(data.title).toBe('综述');
    expect(data.files).toHaveLength(1);
    expect(data.files![0].name).toBe('综述.docx');
    expect(data.files![0].type).toBe(DOCX_MIME);
  });

  it('treats dismissing the share sheet as cancelled', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('Aborted', 'AbortError'); }, configurable: true });

    await expect(shareBlob(new Blob(['docx'], { type: DOCX_MIME }), '综述.docx')).resolves.toBe('cancelled');
  });

  it('reports unsupported when file sharing is not available', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    await expect(shareBlob(new Blob(['docx'], { type: DOCX_MIME }), '综述.docx')).resolves.toBe('unsupported');
    expect(share).not.toHaveBeenCalled();
  });

  it('detects file-sharing support for the docx type', () => {
    expect(canShareFiles()).toBe(false);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => undefined, configurable: true });
    expect(canShareFiles()).toBe(true);
  });
});

describe('shareOrDownloadBlob', () => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const blob = new Blob(['docx'], { type: DOCX_MIME });

  afterEach(() => {
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  function mockAnchorClick() {
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    return click;
  }

  it('downloads when the system rejects the share request', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); }, configurable: true });
    const click = mockAnchorClick();

    await expect(shareOrDownloadBlob(blob, '综述.docx', '综述')).resolves.toBe('downloaded');

    expect(click).toHaveBeenCalledOnce();
  });

  it('downloads when file sharing is unsupported', async () => {
    const click = mockAnchorClick();

    await expect(shareOrDownloadBlob(blob, '综述.docx')).resolves.toBe('downloaded');

    expect(click).toHaveBeenCalledOnce();
  });

  it('keeps shared and cancelled outcomes without downloading', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const click = mockAnchorClick();

    await expect(shareOrDownloadBlob(blob, '综述.docx')).resolves.toBe('shared');

    share.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
    await expect(shareOrDownloadBlob(blob, '综述.docx')).resolves.toBe('cancelled');

    expect(click).not.toHaveBeenCalled();
  });
});
