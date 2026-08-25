-- Cancel/restore tracking for Inquiry, Quotation, Order (Aug 25 update 1)

ALTER TABLE "Inquiry" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Inquiry" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "statusBeforeCancel" "InquiryStatus";
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "statusBeforeCancel" "QuotationStatus";

ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "statusBeforeCancel" "OrderStatus";
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
