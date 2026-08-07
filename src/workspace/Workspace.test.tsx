import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';

const settings = { deepSeekApiKey: 'd', ncbiApiKey: 'n', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'passed' as const, ncbi: 'passed' as const } };

it('defaults the workspace to one-click generation mode', () => {
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), state: { kind: 'idle' } }} />);
  expect(screen.getByRole('radio', { name: '一键生成' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '确认检索式' })).not.toBeChecked();
});

it('requires editing confirmation before starting a 300-result run', async () => {
  const user = userEvent.setup();
  const generateQuery = vi.fn().mockResolvedValue({ query: '(cancer[Title])', count: 286 });
  const startRun = vi.fn();
  render(<Workspace settings={settings} controller={{ generateQuery, startRun, cancel: vi.fn(), state: { kind: 'idle' } }} />);
  await user.type(screen.getByLabelText('研究主题'), '癌症研究');
  await user.click(screen.getByRole('radio', { name: '确认检索式' }));
  await user.click(screen.getByRole('button', { name: '生成检索式' }));
  expect(await screen.findByLabelText('PubMed 检索式')).toHaveValue('(cancer[Title])');
  expect(screen.getByText('预计命中 286 篇')).toBeInTheDocument();
  expect(startRun).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '开始生成' }));
  expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ query: '(cancer[Title])', queryCount: 286, maxResults: 300, mode: 'confirm-query' }));
});

it('starts the workflow automatically in one-click mode after counting the query', async () => {
  const user = userEvent.setup();
  const generateQuery = vi.fn().mockResolvedValue({ query: '(cancer[Title])', count: 286 });
  const startRun = vi.fn();
  render(<Workspace settings={settings} controller={{ generateQuery, startRun, cancel: vi.fn(), state: { kind: 'idle' } }} />);
  await user.type(screen.getByLabelText('研究主题'), '癌症研究');
  await user.click(screen.getByRole('radio', { name: '一键生成' }));
  await user.click(screen.getByRole('button', { name: '一键生成综述' }));
  expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
    query: '(cancer[Title])',
    queryCount: 286,
    mode: 'one-click',
    maxResults: 300,
  }));
  expect(screen.queryByLabelText('PubMed 检索式')).not.toBeInTheDocument();
});

it('shows completion actions without auto-downloading when the workspace mounts', () => {
  const download = vi.fn();
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), download, state: { kind: 'completed', runId: 'r', stats: { fetched: 286, withAbstract: 231, relevant: 74, contextSelected: 60, selected: 42 } } }} />);
  expect(screen.getByRole('button', { name: '再次下载' })).toBeInTheDocument();
  expect(screen.queryByText(/## 1\./)).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(download).not.toHaveBeenCalled();
});

it('does not trigger a second download when a running task transitions to completed', () => {
  const download = vi.fn();
  const controller = {
    generateQuery: vi.fn(),
    startRun: vi.fn(),
    cancel: vi.fn(),
    download,
    state: {
      kind: 'running' as const,
      runId: 'r',
      progress: { stage: 'writing' as const, completed: 4, total: 7, message: '正在撰写综述正文' },
      stats: {},
    },
  };
  const { rerender } = render(<Workspace settings={settings} controller={controller} />);
  rerender(<Workspace settings={settings} controller={{ ...controller, state: { kind: 'completed', runId: 'r', stats: {} } }} />);
  expect(download).not.toHaveBeenCalled();
  rerender(<Workspace settings={settings} controller={{ ...controller, state: { kind: 'completed', runId: 'r', stats: {} } }} />);
  expect(download).not.toHaveBeenCalled();
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

it('animates the active stage icon while a run is in progress', () => {
  render(<Workspace settings={settings} controller={{ generateQuery: vi.fn(), startRun: vi.fn(), cancel: vi.fn(), state: {
    kind: 'running',
    runId: 'r',
    progress: { stage: 'outlining', completed: 2, total: 7, message: '正在选择上下文并生成大纲' },
    stats: {},
  } }} />);
  expect(screen.getByLabelText('任务进度').parentElement?.querySelector('.stage-row__spinner')).not.toBeNull();
});
