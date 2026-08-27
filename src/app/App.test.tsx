import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { db } from '../storage/db';
import { DEFAULT_SETTINGS } from '../settings/useSettings';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }) as Response));
    await db.delete();
    await db.open();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the settings page and setup prompt when required settings are missing', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument());
    expect(screen.getByText('请填写 AI API Key，并完成或跳过 AI 与 NCBI 连接测试，保存后即可开始生成综述。')).toBeInTheDocument();
  });

  it('keeps the settings page as the only active view until setup is complete', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '历史' }));
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '历史记录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the workspace with an AI key and both connection decisions but no NCBI key', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      id: 1,
      deepSeekApiKey: 'ai-key',
      ncbiApiKey: '',
      connectionChecks: { deepSeek: 'passed', ncbi: 'skipped' },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '生成医学综述' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '设置' })).not.toBeInTheDocument();
  });

  it('links to the source repository', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'GitHub 仓库' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute('href', 'https://github.com/zhang-bin-98/pubmed-summary-pwa');
  });
});
