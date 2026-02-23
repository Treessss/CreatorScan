import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FeedbackProvider, useFeedback } from '../components/FeedbackProvider';

function Probe() {
  const { notify, confirm } = useFeedback();
  const [result, setResult] = React.useState('');

  return (
    <div>
      <button onClick={() => notify('操作成功', 'success')}>show-toast</button>
      <button
        onClick={async () => {
          const ok = await confirm({
            title: '确认删除',
            message: '是否继续？',
            confirmText: '继续',
            cancelText: '取消',
            type: 'warning',
          });
          setResult(ok ? 'ok' : 'cancel');
        }}
      >
        ask-confirm
      </button>
      <div data-testid="confirm-result">{result}</div>
    </div>
  );
}

describe('FeedbackProvider', () => {
  it('shows toast and auto hides', () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <Probe />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByText('show-toast'));
    expect(screen.getByText('操作成功')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('resolves confirm promise on confirm and cancel', async () => {
    render(
      <FeedbackProvider>
        <Probe />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByText('ask-confirm'));
    expect(screen.getByText('确认删除')).toBeInTheDocument();
    fireEvent.click(screen.getByText('继续'));
    expect(await screen.findByText('ok')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ask-confirm'));
    fireEvent.click(screen.getByText('取消'));
    expect(await screen.findByText('cancel')).toBeInTheDocument();
  });
});

