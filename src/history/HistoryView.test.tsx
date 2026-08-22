import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { HistoryView } from './HistoryView';

it('shows run metadata without rendering review body and exposes local actions', async () => {
  const user = userEvent.setup();
  const onDownloadDocx = vi.fn();
  render(<HistoryView runs={[{ id: 'r', topic: '癌症研究', status: 'completed', stage: 'completed', createdAt: 1, updatedAt: 2, stats: { fetched: 300, selected: 60 }, query: 'term', modelId: 'model', maxResults: 300 }]} onResume={vi.fn()} onDownloadDocx={onDownloadDocx} onExportJson={vi.fn()} onExportCsv={vi.fn()} onDelete={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByText('癌症研究')).toBeInTheDocument();
  expect(screen.queryByText(/## 1\./)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '再次下载 Word' }));
  expect(onDownloadDocx).toHaveBeenCalledWith('r');
});
