import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';

const settings = { deepSeekApiKey: 'd', ncbiApiKey: 'n', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'passed' as const, ncbi: 'passed' as const } };

it('requires editing confirmation before starting a 300-result run', async () => {
  const user = userEvent.setup();
  const generateQuery = vi.fn().mockResolvedValue({ query: '(cancer[Title])', count: 286 });
  const startRun = vi.fn();
  render(<Workspace settings={settings} controller={{ generateQuery, startRun, cancel: vi.fn(), state: { kind: 'idle' } }} />);
  await user.type(screen.getByLabelText('研究主题'), '癌症研究');
  await user.click(screen.getByRole('button', { name: '生成检索式' }));
  expect(await screen.findByLabelText('PubMed 检索式')).toHaveValue('(cancer[Title])');
  expect(screen.getByText('预计命中 286 篇')).toBeInTheDocument();
  expect(startRun).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '开始生成' }));
  expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ query: '(cancer[Title])', maxResults: 300 }));
});

it('shows completion actions without rendering the generated body', () => {
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), state: { kind: 'completed', runId: 'r', stats: { fetched: 286, withAbstract: 231, relevant: 74, contextSelected: 60, selected: 42 } } }} />);
  expect(screen.getByRole('button', { name: '再次下载' })).toBeInTheDocument();
  expect(screen.queryByText(/## 1\./)).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('distinguishes context selection from references used in the final body', () => {
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), state: { kind: 'completed', runId: 'r', stats: { contextSelected: 133, selected: 95 } } }} />);
  expect(screen.getByText('上下文')).toBeInTheDocument();
  expect(screen.getByText('正文引用')).toBeInTheDocument();
  expect(screen.getByText('133')).toBeInTheDocument();
  expect(screen.getByText('95')).toBeInTheDocument();
});

it('shows the live operation message while a run is in progress', () => {
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), state: {
    kind: 'running',
    runId: 'r',
    progress: { stage: 'screening', completed: 1.5, total: 7, message: '正在筛选相关文献（第 2/15 批）' },
    stats: { fetched: 300, withAbstract: 248, relevant: 20 },
  } }} />);
  expect(screen.getByRole('status')).toHaveTextContent('正在筛选相关文献（第 2/15 批）');
});
