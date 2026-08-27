import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

const initial = { deepSeekApiKey: '', ncbiApiKey: '', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-v4-flash', maxResults: 300, contextWindow: 1_000_000, connectionChecks: { deepSeek: 'untested' as const, ncbi: 'untested' as const } };

it('uses password fields, defaults to 300, and persists only after save', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<SettingsView initial={initial} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={vi.fn()} onSave={onSave} onClearAll={vi.fn()} />);
  expect(screen.getByLabelText('AI API Key')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('默认抓取量')).toHaveValue(300);
  await user.type(screen.getByLabelText('AI API Key'), 'secret');
  await user.type(screen.getByLabelText('My NCBI API Key'), 'ncbi');
  await user.click(screen.getByRole('button', { name: '跳过 AI 测试' }));
  await user.click(screen.getByRole('button', { name: '跳过 NCBI 测试' }));
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deepSeekApiKey: 'secret', maxResults: 300 }));
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});

it('shows the required API key prompt when opened for initial setup', () => {
  render(<SettingsView initial={initial} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={vi.fn()} onSave={vi.fn()} onClearAll={vi.fn()} showApiKeyPrompt />);
  expect(screen.getByText('请先设置 AI API Key 和 My NCBI API Key，保存后才能开始生成综述。')).toBeInTheDocument();
});
