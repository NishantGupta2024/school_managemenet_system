import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OnlineCheckoutModal } from '../components/OnlineCheckoutModal';
import { onlinePaymentsApi, FeeInvoice } from '../services/api';
import * as razorpayUtils from '../utils/razorpay';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    onlinePaymentsApi: {
      createOrder: vi.fn(),
    },
  };
});

const mockInvoice: FeeInvoice = {
  id: 'inv-uuid-1',
  schoolId: 'sch-uuid-1',
  studentId: 'stud-uuid-1',
  academicYearId: 'ay-uuid-1',
  billingMonth: 1,
  monthName: 'April',
  dueDate: '2026-04-10T00:00:00.000Z',
  grossAmount: 1500,
  discountAmount: 0,
  netAmount: 1500,
  paidAmount: 500,
  remainingBalance: 1000,
  status: 'DUE',
  storedStatus: 'DUE',
  generatedAt: '2026-04-01T00:00:00.000Z',
  items: [],
};

const mockOrderResponse = {
  orderId: 'order_rzp_mock12345',
  keyId: 'rzp_test_schoolKey123',
  amount: 1000,
  amountInPaise: 100000,
  currency: 'INR',
  invoiceId: 'inv-uuid-1',
  studentId: 'stud-uuid-1',
  schoolName: 'Greenwood High School',
  studentName: 'Rahul Sharma',
  studentEmail: 'parent@example.com',
  studentPhone: '9876543210',
  idempotencyKey: 'idemp-mock-uuid',
  status: 'CREATED',
  createdAt: new Date().toISOString(),
};

describe('OnlineCheckoutModal Component (Phase F)', () => {
  let mockRazorpayInstance: any;
  let rzpOptionsCaptured: any;

  beforeEach(() => {
    vi.clearAllMocks();
    rzpOptionsCaptured = null;

    mockRazorpayInstance = {
      open: vi.fn(),
      on: vi.fn(),
    };

    // Mock window.Razorpay constructor (must use `function` for `new window.Razorpay(...)` in Vitest 4+)
    window.Razorpay = vi.fn().mockImplementation(function (this: any, options: any) {
      rzpOptionsCaptured = options;
      return mockRazorpayInstance;
    });

    vi.spyOn(razorpayUtils, 'loadRazorpayScript').mockResolvedValue(true);
  });

  it('renders modal with invoice summary, outstanding balance, and TEST mode pill', () => {
    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Pay Fee Online — April/i)).toBeInTheDocument();
    expect(screen.getByText(/Razorpay TEST Mode Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Rahul Sharma \(ADM-001\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹1,000.00').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /Proceed to Razorpay Checkout/i }),
    ).toBeInTheDocument();
  });

  it('validates custom partial payment amounts (minimum ₹1.00, maximum balance)', async () => {
    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    // Switch to custom amount
    const customRadio = screen.getByLabelText(/Pay Custom \/ Partial Amount/i);
    fireEvent.click(customRadio);

    const input = screen.getByPlaceholderText(/Max: 1000/i);
    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });

    // Test sub-₹1 amount
    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Minimum online payment amount is ₹1.00/i),
      ).toBeInTheDocument();
    });

    // Test amount exceeding balance
    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Payment amount cannot exceed total outstanding balance/i),
      ).toBeInTheDocument();
    });

    expect(onlinePaymentsApi.createOrder).not.toHaveBeenCalled();
  });

  it('successfully initializes Checkout and launches Razorpay modal with server-returned order details', async () => {
    vi.mocked(onlinePaymentsApi.createOrder).mockResolvedValue(mockOrderResponse);

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onlinePaymentsApi.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-uuid-1',
          amount: undefined, // Defaults to full balance
        }),
        expect.any(String),
      );
    });

    expect(window.Razorpay).toHaveBeenCalled();
    expect(mockRazorpayInstance.open).toHaveBeenCalled();

    // Verify minimum required options passed to SDK (no secrets)
    expect(rzpOptionsCaptured.key).toBe('rzp_test_schoolKey123');
    expect(rzpOptionsCaptured.order_id).toBe('order_rzp_mock12345');
    expect(rzpOptionsCaptured.amount).toBe(100000);
    expect(rzpOptionsCaptured.currency).toBe('INR');
    expect(rzpOptionsCaptured.prefill.name).toBe('Rahul Sharma');
    expect(rzpOptionsCaptured.keySecret).toBeUndefined();
  });

  it('prevents duplicate clicks while order creation / checkout is initializing', async () => {
    let resolveOrder: any;
    vi.mocked(onlinePaymentsApi.createOrder).mockImplementation(
      () =>
        new Promise((res) => {
          resolveOrder = res;
        }),
    );

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    // Button transitions to loading and disabled
    await waitFor(() => {
      expect(screen.getByText(/Initializing Checkout/i)).toBeInTheDocument();
    });
    expect(submitBtn).toBeDisabled();

    // Verify order was invoked
    await waitFor(() => {
      expect(onlinePaymentsApi.createOrder).toHaveBeenCalledTimes(1);
    });

    // Secondary click attempt
    fireEvent.click(submitBtn);
    expect(onlinePaymentsApi.createOrder).toHaveBeenCalledTimes(1);

    resolveOrder(mockOrderResponse);
  });

  it('handles Razorpay SDK script loading failure gracefully', async () => {
    vi.spyOn(razorpayUtils, 'loadRazorpayScript').mockResolvedValue(false);

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load Razorpay payment SDK/i),
      ).toBeInTheDocument();
    });

    expect(window.Razorpay).not.toHaveBeenCalled();
  });

  it('handles backend order creation error and renders server error message', async () => {
    vi.mocked(onlinePaymentsApi.createOrder).mockRejectedValue({
      response: {
        data: { message: 'Payment gateway is currently not active for this school.' },
      },
    });

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Payment gateway is currently not active for this school/i),
      ).toBeInTheDocument();
    });
  });

  it('handles user cancellation without claiming payment or modifying invoice balance', async () => {
    vi.mocked(onlinePaymentsApi.createOrder).mockResolvedValue(mockOrderResponse);

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(rzpOptionsCaptured?.modal?.ondismiss).toBeDefined();
    });

    // Simulate user closing the Razorpay checkout modal
    rzpOptionsCaptured.modal.ondismiss();

    await waitFor(() => {
      expect(screen.getByText('Checkout Cancelled')).toBeInTheDocument();
      expect(
        screen.getByText(/No charges were made, and your invoice balance remains unchanged/i),
      ).toBeInTheDocument();
    });
  });

  it('displays "Payment Submitted — Pending Server Settlement" on client callback without marking invoice as paid', async () => {
    vi.mocked(onlinePaymentsApi.createOrder).mockResolvedValue(mockOrderResponse);
    const mockRefresh = vi.fn();

    render(
      <OnlineCheckoutModal
        isOpen={true}
        invoice={mockInvoice}
        studentName="Rahul Sharma"
        studentAdmissionNumber="ADM-001"
        onClose={vi.fn()}
        onRefreshStatement={mockRefresh}
      />,
    );

    const submitBtn = screen.getByRole('button', {
      name: /Proceed to Razorpay Checkout/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(rzpOptionsCaptured?.handler).toBeDefined();
    });

    // Simulate Razorpay client callback on payment completion
    rzpOptionsCaptured.handler({
      razorpay_payment_id: 'pay_test_99887766',
      razorpay_order_id: 'order_rzp_mock12345',
      razorpay_signature: 'signature_hex_123',
    });

    await waitFor(() => {
      expect(
        screen.getByText('Payment Submitted — Pending Server Settlement'),
      ).toBeInTheDocument();
      expect(screen.getByText(/pay_test_99887766/i)).toBeInTheDocument();
      expect(
        screen.getByText(/invoice will be settled and receipts issued upon server-side webhook confirmation/i),
      ).toBeInTheDocument();
    });

    // Refresh Invoice Status button triggers existing supported endpoint query
    const refreshBtn = screen.getByRole('button', {
      name: /Refresh Invoice Status/i,
    });
    fireEvent.click(refreshBtn);
    expect(mockRefresh).toHaveBeenCalled();
  });
});
