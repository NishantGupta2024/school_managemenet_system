import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaymentGatewaySettingsView } from '../components/PaymentGatewaySettingsView';
import { paymentGatewayApi, PaymentGatewayConfig } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    paymentGatewayApi: {
      getConfig: vi.fn(),
      configure: vi.fn(),
      verify: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

const mockActiveConfig: PaymentGatewayConfig = {
  id: 'cfg-uuid-1',
  schoolId: 'school-uuid-1',
  provider: 'RAZORPAY',
  merchantName: 'Greenwood High Merchant',
  keyId: 'rzp_test_Abcd1234XYZ',
  keySecretMasked: '••••••••••••••••1234',
  hasKeySecret: true,
  hasWebhookSecret: true,
  webhookSecretMasked: '••••••••••••••••5678',
  environment: 'TEST',
  status: 'ACTIVE',
  lastVerifiedAt: '2026-10-22T00:00:00.000Z',
  lastVerificationError: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

describe('PaymentGatewaySettingsView Component (Phase D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially and then shows configuration details', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(mockActiveConfig);

    render(<PaymentGatewaySettingsView />);

    expect(screen.getByText(/Loading payment gateway settings/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Payment Gateway Configuration')).toBeInTheDocument();
    });

    expect(screen.getByText('Active & Verified')).toBeInTheDocument();
    expect(screen.getByText('TEST Mode Only')).toBeInTheDocument();
    expect(screen.getByText('Greenwood High Merchant')).toBeInTheDocument();
    expect(screen.getByText('rzp_test_Abcd1234XYZ')).toBeInTheDocument();
    expect(screen.getByText('••••••••••••••••1234')).toBeInTheDocument();
  });

  it('renders "Not Configured" badge when no config exists', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(null);

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByText('Not Configured')).toBeInTheDocument();
    });

    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
  });

  it('rejects live key inputs starting with rzp_live_', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(null);

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('rzp_test_...')).toBeInTheDocument();
    });

    const keyIdInput = screen.getByPlaceholderText('rzp_test_...');
    const secretInput = screen.getByPlaceholderText('Enter your Razorpay Key Secret');
    const submitBtn = screen.getByText('Save Configuration');

    fireEvent.change(keyIdInput, { target: { value: 'rzp_live_forbidden12345' } });
    fireEvent.change(secretInput, { target: { value: 'my_live_secret_12345' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Live Mode credentials are not permitted in this phase/i),
      ).toBeInTheDocument();
    });

    expect(paymentGatewayApi.configure).not.toHaveBeenCalled();
  });

  it('requires secret on initial configuration and calls api.configure with valid test keys', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(null);
    vi.mocked(paymentGatewayApi.configure).mockResolvedValue(mockActiveConfig);

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('rzp_test_...')).toBeInTheDocument();
    });

    const keyIdInput = screen.getByPlaceholderText('rzp_test_...');
    const secretInput = screen.getByPlaceholderText('Enter your Razorpay Key Secret');
    const merchantInput = screen.getByPlaceholderText(/Springfield Academy Fee Collection/i);
    const submitBtn = screen.getByText('Save Configuration');

    // Missing secret
    fireEvent.change(keyIdInput, { target: { value: 'rzp_test_valid123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Key Secret is required for initial configuration/i)).toBeInTheDocument();
    });

    // Provide valid secret and merchant name
    fireEvent.change(secretInput, { target: { value: 'valid_test_secret_999' } });
    fireEvent.change(merchantInput, { target: { value: 'Springfield Academy' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(paymentGatewayApi.configure).toHaveBeenCalledWith({
        keyId: 'rzp_test_valid123',
        keySecret: 'valid_test_secret_999',
        merchantName: 'Springfield Academy',
        webhookSecret: undefined,
      });
    });

    expect(
      screen.getByText(/Payment gateway credentials saved successfully/i),
    ).toBeInTheDocument();
  });

  it('triggers Test Connection and displays success verification feedback', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(mockActiveConfig);
    vi.mocked(paymentGatewayApi.verify).mockResolvedValue({
      success: true,
      status: 'ACTIVE',
      message: 'Successfully connected and verified Razorpay credentials',
      testedAt: '2026-10-22T00:10:00.000Z',
    });

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Test Connection/i })).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Test Connection/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(paymentGatewayApi.verify).toHaveBeenCalled();
      expect(
        screen.getByText(/Successfully connected and verified Razorpay credentials/i),
      ).toBeInTheDocument();
    });
  });

  it('handles Test Connection failure and renders error alert', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(mockActiveConfig);
    vi.mocked(paymentGatewayApi.verify).mockResolvedValue({
      success: false,
      status: 'PENDING_VERIFICATION',
      message: 'Invalid Key ID or Key Secret for Razorpay TEST account',
      testedAt: '2026-10-22T00:10:00.000Z',
    });

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Test Connection/i })).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Test Connection/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid Key ID or Key Secret for Razorpay TEST account/i),
      ).toBeInTheDocument();
    });
  });

  it('opens confirmation modal and disables gateway when confirmed', async () => {
    vi.mocked(paymentGatewayApi.getConfig).mockResolvedValue(mockActiveConfig);
    vi.mocked(paymentGatewayApi.disconnect).mockResolvedValue({
      success: true,
      message: 'Payment gateway disabled successfully.',
    });

    render(<PaymentGatewaySettingsView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Disable Gateway/i })).toBeInTheDocument();
    });

    // Click Disable Gateway button
    fireEvent.click(screen.getByRole('button', { name: /Disable Gateway/i }));

    // Modal appears
    expect(screen.getByText('Disable Payment Gateway?')).toBeInTheDocument();
    expect(screen.getByText(/Disabling the payment gateway will prevent parents/i)).toBeInTheDocument();

    // Confirm Disable
    const confirmBtn = screen.getByRole('button', { name: /Confirm Disable/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(paymentGatewayApi.disconnect).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Payment gateway disabled successfully/i)).toBeInTheDocument();
    });
  });
});
