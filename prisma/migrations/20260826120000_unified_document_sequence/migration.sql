-- 3rd Update item 5: a single global sequence backs the shared
-- Quotation/Order/Invoice transaction-identity numbering
-- (PREFIX-YYYY-MMDD-0001), generated atomically at the database level so
-- concurrent creates can never draw the same number.
CREATE SEQUENCE IF NOT EXISTS "document_number_seq" START WITH 1 INCREMENT BY 1;
