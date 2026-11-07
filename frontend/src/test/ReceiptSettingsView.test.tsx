import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptSettingsView } from '../components/ReceiptSettingsView';
import { receiptNumberingApi } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    receiptNumberingApi: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      preview: vi.fn(),
    },
  };
});

describe('ReceiptSettingsView Component', () => {
  const mockDefaultConfig = {
    schoolId: 'sch-1',
    prefix: 'RCT',
    yearFormat: 'SHORT_6DIGIT' as const,
    paddingDigits: 5,
    separator: '-',
    previewSample: 'RCT-202627-00001',
    isCustomized: false,
  };

  const mockCustomConfig = {
    id: 'cfg-1',
    schoolId: 'sch-1',
    prefix: 'DPMS',
    yearFormat: 'FULL_8DIGIT' as const,
    paddingDigits: 6,
    separator: '/',
    previewSample: 'DPMS/20262027/000001',
    isCustomized: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. loads and displays current configuration with live preview badge', async () => {
    vi.mocked(receiptNumberingApi.getConfig).mockResolvedValueOnce(mockDefaultConfig);

    render(<ReceiptSettingsView />);

    expect(screen.getByTestId('receipt-settings-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('receipt-settings-view')).toBeDefined();
    });

    const prefixInput = screen.getByLabelText(/Receipt Prefix/i) as HTMLInputElement;
    expect(prefixInput.value).toBe('RCT');

    const preview = screen.getByTestId('live-receipt-preview');
    expect(preview.textContent).toBe('RCT-202627-00001');
    expect(screen.getByText(/System Default \(RCT\)/i)).toBeDefined();
  });

  it('2. dynamically updates live preview when prefix or separator inputs change', async () => {
    vi.mocked(receiptNumberingApi.getConfig).mockResolvedValueOnce(mockDefaultConfig);

    render(<ReceiptSettingsView />);

    await waitFor(() => {
      expect(screen.getByTestId('receipt-settings-view')).toBeDefined();
    });

    const prefixInput = screen.getByLabelText(/Receipt Prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'dpms' } });

    const separatorSelect = screen.getByLabelText(/Separator Character/i);
    fireEvent.change(separatorSelect, { target: { value: '/' } });

    const preview = screen.getByTestId('live-receipt-preview');
    expect(preview.textContent).toBe('DPMS/202627/00001');
  });

  it('3. validates prefix minimum length and disables submit when invalid', async () => {
    vi.mocked(receiptNumberingApi.getConfig).mockResolvedValueOnce(mockDefaultConfig);

    render(<ReceiptSettingsView />);

    await waitFor(() => {
      expect(screen.getByTestId('receipt-settings-view')).toBeDefined();
    });

    const prefixInput = screen.getByLabelText(/Receipt Prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'A' } });

    expect(screen.getByText(/Prefix must be at least 2 alphanumeric characters/i)).toBeDefined();

    const submitBtn = screen.getByRole('button', { name: /Save Receipt Numbering/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('4. submits updated configuration and displays success notification banner', async () => {
    vi.mocked(receiptNumberingApi.getConfig).mockResolvedValueOnce(mockDefaultConfig);
    vi.mocked(receiptNumberingApi.updateConfig).mockResolvedValueOnce(mockCustomConfig);

    render(<ReceiptSettingsView />);

    await waitFor(() => {
      expect(screen.getByTestId('receipt-settings-view')).toBeDefined();
    });

    const prefixInput = screen.getByLabelText(/Receipt Prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'DPMS' } });

    const yearSelect = screen.getByLabelText(/Academic Session Token/i);
    fireEvent.change(yearSelect, { target: { value: 'FULL_8DIGIT' } });

    const paddingSelect = screen.getByLabelText(/Sequence Number Padding/i);
    fireEvent.change(paddingSelect, { target: { value: '6' } });

    const separatorSelect = screen.getByLabelText(/Separator Character/i);
    fireEvent.change(separatorSelect, { target: { value: '/' } });

    const submitBtn = screen.getByRole('button', { name: /Save Receipt Numbering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(receiptNumberingApi.updateConfig).toHaveBeenCalledWith({
        prefix: 'DPMS',
        yearFormat: 'FULL_8DIGIT',
        paddingDigits: 6,
        separator: '/',
      });
      expect(screen.getByRole('status')).toBeDefined();
    });
  });

  it('5. displays error notification when backend update fails', async () => {
    vi.mocked(receiptNumberingApi.getConfig).mockResolvedValueOnce(mockDefaultConfig);
    vi.mocked(receiptNumberingApi.updateConfig).mockRejectedValueOnce({
      response: { data: { message: 'Cross-tenant modification forbidden' } },
    });

    render(<ReceiptSettingsView />);

    await waitFor(() => {
      expect(screen.getByTestId('receipt-settings-view')).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Save Receipt Numbering/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Unable to update configuration/i)).toBeDefined();
      expect(screen.getByText(/Cross-tenant modification forbidden/i)).toBeDefined();
    });
  });
});
