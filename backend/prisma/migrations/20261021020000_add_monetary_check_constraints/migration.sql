-- Migration: 20261021020000_add_monetary_check_constraints
-- Financial Integrity Remediation (FEE-P1E)
-- Adds database-level CHECK constraints on monetary columns across financial tables.

-- 1. Payments: Amount must be strictly positive
ALTER TABLE "payments" 
  ADD CONSTRAINT "chk_payments_amount_positive" 
  CHECK ("amount" > 0);

-- 2. Payment Allocations: Allocated amount must be strictly positive
ALTER TABLE "payment_allocations" 
  ADD CONSTRAINT "chk_payment_allocations_amount_positive" 
  CHECK ("allocatedAmount" > 0);

-- 3. Payment Refunds: Refund amount must be strictly positive
ALTER TABLE "payment_refunds" 
  ADD CONSTRAINT "chk_payment_refunds_amount_positive" 
  CHECK ("refundAmount" > 0);

-- 4. Payment Refund Allocations: Amount must be strictly positive
ALTER TABLE "payment_refund_allocations" 
  ADD CONSTRAINT "chk_payment_refund_allocations_amount_positive" 
  CHECK ("amount" > 0);

-- 5. Payment Reversals: Total amount must be strictly positive
ALTER TABLE "payment_reversals" 
  ADD CONSTRAINT "chk_payment_reversals_total_amount_positive" 
  CHECK ("totalAmount" > 0);

-- 6. Receipts: Total amount must be strictly positive
ALTER TABLE "receipts" 
  ADD CONSTRAINT "chk_receipts_total_amount_positive" 
  CHECK ("totalAmount" > 0);

-- 7. Fee Invoices: Non-negative amounts and balance equation consistency
ALTER TABLE "fee_invoices" 
  ADD CONSTRAINT "chk_fee_invoices_amounts_valid" 
  CHECK (
    "grossAmount" >= 0 AND 
    "discountAmount" >= 0 AND 
    "netAmount" >= 0 AND
    "discountAmount" <= "grossAmount" AND
    "netAmount" = ("grossAmount" - "discountAmount")
  );

-- 8. Invoice Items: Non-negative amounts and balance equation consistency
ALTER TABLE "invoice_items" 
  ADD CONSTRAINT "chk_invoice_items_amounts_valid" 
  CHECK (
    "grossAmount" >= 0 AND 
    "discountAmount" >= 0 AND 
    "netAmount" >= 0 AND
    "discountAmount" <= "grossAmount" AND
    "netAmount" = ("grossAmount" - "discountAmount")
  );

-- 9. Assessed Fines: Non-negative assessed amount
ALTER TABLE "assessed_fines" 
  ADD CONSTRAINT "chk_assessed_fines_amount_non_negative" 
  CHECK ("assessedAmount" >= 0);

-- 10. Fine Waivers: Waived amount must be strictly positive
ALTER TABLE "fine_waivers" 
  ADD CONSTRAINT "chk_fine_waivers_amount_positive" 
  CHECK ("waivedAmount" > 0);

-- 11. Fee Structure Items: Amount must be non-negative
ALTER TABLE "fee_structure_items" 
  ADD CONSTRAINT "chk_fee_structure_items_amount_non_negative" 
  CHECK ("amount" >= 0);
