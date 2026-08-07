import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { db } from '../storage/db';

describe('App', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('shows the settings page and API key prompt when credentials are missing', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument());
    expect(screen.getByText('请先设置 DeepSeek API Key 和 My NCBI API Key，保存后才能开始生成综述。')).toBeInTheDocument();
  });

  it('keeps the settings page as the only active view until both keys are configured', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '历史' }));
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '历史记录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('links to the source repository', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'GitHub 仓库' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute('href', 'https://github.com/zhang-bin-98/pubmed-summary-pwa');
  });
});
