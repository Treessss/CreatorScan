import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';
import Settings from '../pages/Settings';
import InfluencerList from '../pages/InfluencerList';
import { FeedbackProvider } from '../components/FeedbackProvider';

vi.mock('../services/api', () => ({
  authService: {
    login: vi.fn(),
    getMe: vi.fn().mockResolvedValue({ username: 'tester' }),
  },
  smtpService: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    test: vi.fn(),
  },
  userService: {
    updateProfile: vi.fn().mockResolvedValue({ username: 'tester' }),
    updatePassword: vi.fn().mockResolvedValue({ username: 'tester' }),
    getSubAccounts: vi.fn().mockResolvedValue([]),
    createSubAccount: vi.fn(),
    deleteSubAccount: vi.fn(),
    updateSubAccountPassword: vi.fn(),
    getAuditLogs: vi.fn().mockResolvedValue([]),
  },
  creatorService: {
    getAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    delete: vi.fn(),
    importFromExcel: vi.fn(),
  },
}));

describe('Key page smoke tests', () => {
  function renderWithProviders(ui: React.ReactElement) {
    return render(<FeedbackProvider>{ui}</FeedbackProvider>);
  }

  it('renders Login page', () => {
    renderWithProviders(<Login onLogin={() => {}} />);
    expect(screen.getByText('欢迎回来')).toBeInTheDocument();
  });

  it('renders Settings page and loads profile tab', async () => {
    renderWithProviders(<Settings />);
    expect(screen.getByText('系统设置')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('个人信息'));
    });
    await waitFor(() => {
      expect(screen.getByText('保存个人资料')).toBeInTheDocument();
    });
  });

  it('renders Influencer list page', async () => {
    renderWithProviders(
      <MemoryRouter>
        <InfluencerList />
      </MemoryRouter>
    );
    expect(screen.getByText('网红列表管理')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });
});
