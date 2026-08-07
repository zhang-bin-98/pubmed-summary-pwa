import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

it('uses password fields, defaults to 300, and persists only after save', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<SettingsView initial={{ deepSeekApiKey: '', ncbiApiKey: '', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'untested', ncbi: 'untested' } }} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={vi.fn()} onSave={onSave} onClearAll={vi.fn()} />);
  expect(screen.getByLabelText('DeepSeek API Key')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('默认抓取量')).toHaveValue(300);
  await user.type(screen.getByLabelText('DeepSeek API Key'), 'secret');
  await user.type(screen.getByLabelText('My NCBI API Key'), 'ncbi');
  await user.click(screen.getByRole('button', { name: '跳过 DeepSeek 测试' }));
  await user.click(screen.getByRole('button', { name: '跳过 NCBI 测试' }));
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deepSeekApiKey: 'secret', maxResults: 300 }));
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
