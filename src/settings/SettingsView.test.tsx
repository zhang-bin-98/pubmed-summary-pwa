import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

const initial = { deepSeekApiKey: '', ncbiApiKey: '', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-v4-flash', maxResults: 300, contextWindow: 1_000_000, connectionChecks: { deepSeek: 'untested' as const, ncbi: 'untested' as const } };

it('tests NCBI anonymously and saves without an NCBI API key after both connection decisions', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onTestNcbi = vi.fn().mockResolvedValue(true);
  const view = render(<SettingsView initial={initial} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={onTestNcbi} onSave={onSave} onClearAll={vi.fn()} />);
  expect(screen.getByLabelText('AI API Key')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('My NCBI API Key（可选）')).toHaveAttribute('type', 'password');
  expect(screen.getByText('留空时使用匿名访问，NCBI 请求速率限制为每秒 3 次。')).toBeInTheDocument();
  expect(screen.getByLabelText('默认抓取量')).toHaveValue(300);
  await user.type(screen.getByLabelText('AI API Key'), 'secret');
  await user.click(screen.getByRole('button', { name: '跳过 AI 测试' }));
  expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '测试 NCBI 连接' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '测试 NCBI 连接' }));
  expect(onTestNcbi).toHaveBeenCalledWith(expect.objectContaining({ ncbiApiKey: '' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '保存设置' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deepSeekApiKey: 'secret', ncbiApiKey: '', maxResults: 300 }));
  const saved = onSave.mock.calls[0]![0];
  view.rerender(<SettingsView initial={saved} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={onTestNcbi} onSave={onSave} onClearAll={vi.fn()} />);
  expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled();
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});

it('shows the setup completion prompt when opened for initial setup', () => {
  render(<SettingsView initial={initial} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={vi.fn()} onSave={vi.fn()} onClearAll={vi.fn()} showApiKeyPrompt />);
  expect(screen.getByText('请填写 AI API Key，并完成或跳过 AI 与 NCBI 连接测试，保存后即可开始生成综述。')).toBeInTheDocument();
});

it('loads a selectable model before the AI connection test is clicked', async () => {
  const onLoadDeepSeekModels = vi.fn().mockResolvedValue([{ id: 'qwen-plus', contextLength: 128_000 }]);
  const onTestDeepSeek = vi.fn();
  const configured = { ...initial, deepSeekApiKey: 'secret', modelId: '' };
  render(<SettingsView initial={configured} models={[]} onLoadDeepSeekModels={onLoadDeepSeekModels} onTestDeepSeek={onTestDeepSeek} onTestNcbi={vi.fn()} onSave={vi.fn()} onClearAll={vi.fn()} />);

  await waitFor(() => expect(screen.getByRole('combobox', { name: 'AI 模型 ID' })).toHaveValue('qwen-plus'));
  expect(onLoadDeepSeekModels).toHaveBeenCalledWith(expect.objectContaining({ deepSeekApiKey: 'secret' }), expect.any(AbortSignal));
  expect(onTestDeepSeek).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '测试 AI 连接' })).toBeEnabled();
  expect(screen.getByRole('spinbutton', { name: '上下文长度' })).toHaveValue(128_000);
});
