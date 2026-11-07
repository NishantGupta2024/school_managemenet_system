export class OnlinePaymentOrderResponseDto {
  /**
   * Razorpay order identifier (e.g. "order_EKwxwAgItmmXdp").
   * Passed to Razorpay Checkout SDK.
   */
  orderId: string;

  /**
   * School's public Razorpay Key ID (e.g. "rzp_test_51Abc").
   * Sensitive key secrets are strictly excluded.
   */
  keyId: string;

  /**
   * Authorized payable amount in INR rupees (e.g. 1500.50).
   */
  amount: number;

  /**
   * Authorized payable amount in paise (e.g. 150050) for Razorpay SDK.
   */
  amountInPaise: number;

  /**
   * Currency code (always "INR").
   */
  currency: string;

  /**
   * Target invoice ID.
   */
  invoiceId: string;

  /**
   * Target student ID.
   */
  studentId: string;

  /**
   * School name or merchant display name for Checkout modal.
   */
  schoolName: string;

  /**
   * Student full name for Checkout prefill.
   */
  studentName: string;

  /**
   * Guardian/Student email for Checkout prefill.
   */
  studentEmail?: string;

  /**
   * Guardian/Student contact phone for Checkout prefill.
   */
  studentPhone?: string;

  /**
   * Client-provided or generated idempotency key.
   */
  idempotencyKey: string;

  /**
   * Status of the online payment order (e.g. "CREATED").
   */
  status: string;

  /**
   * ISO 8601 creation timestamp.
   */
  createdAt: string;
}
