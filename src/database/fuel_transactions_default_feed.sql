-- =====================================================
-- Default Fuel Transactions Feed
-- Server-side unified feed for the default "All Fuel Transactions" page
-- =====================================================

CREATE OR REPLACE VIEW fuel_transactions_default_feed AS
WITH refill_rows AS (
  SELECT
    'refill-' || fr.id::text AS id,
    COALESCE(fr.refill_date, fr.created_at) AS transaction_date,
    CASE
      WHEN fr.vehicle_id IS NULL THEN 'tank_refill'
      ELSE 'vehicle_refill'
    END AS transaction_type,
    COALESCE(fr.fuel_type, 'gasoline') AS fuel_type,
    COALESCE(fr.liters_added, 0)::numeric AS amount,
    COALESCE(fr.total_cost, 0)::numeric AS cost,
    COALESCE(fr.unit_price, fr.cost_per_liter, 0)::numeric AS unit_price,
    fr.fuel_station,
    fr.location,
    NULL::integer AS odometer_reading,
    fr.notes,
    fr.refilled_by AS filled_by,
    fr.refilled_by AS performed_by_name,
    NULL::uuid AS performed_by_user_id,
    fr.vehicle_id,
    v.name AS vehicle_name,
    v.plate_number AS vehicle_plate,
    v.model AS vehicle_model,
    v.vehicle_type,
    fr.created_at,
    CASE
      WHEN fr.vehicle_id IS NULL THEN 'tank_refill'
      ELSE 'direct_station'
    END AS source,
    true AS is_financial_expense,
    COALESCE(fr.invoice_image, to_jsonb(fr.invoice_photo_url), to_jsonb(fr.invoice_url)) AS receipt_media,
    COALESCE(fr.invoice_image, to_jsonb(fr.invoice_photo_url), to_jsonb(fr.invoice_url)) AS invoice_image,
    NULL::uuid AS rental_id,
    NULL::text AS rental_reference,
    NULL::numeric AS fuel_lines_before,
    NULL::numeric AS fuel_lines_after,
    NULL::numeric AS liters_before,
    NULL::numeric AS liters_after
  FROM fuel_refills fr
  LEFT JOIN saharax_0u4w4d_vehicles v ON v.id = fr.vehicle_id
),
withdrawal_rows AS (
  SELECT
    'withdrawal-' || fw.id::text AS id,
    COALESCE(fw.withdrawal_date, fw.created_at) AS transaction_date,
    COALESCE(fw.transaction_type, 'withdrawal') AS transaction_type,
    'gasoline'::text AS fuel_type,
    COALESCE(fw.liters_taken, 0)::numeric AS amount,
    COALESCE(fw.total_cost, 0)::numeric AS cost,
    COALESCE(fw.unit_price, 0)::numeric AS unit_price,
    NULL::text AS fuel_station,
    NULL::text AS location,
    fw.odometer_reading,
    fw.notes,
    fw.filled_by AS filled_by,
    COALESCE(fw.performed_by_name, fw.filled_by, 'System') AS performed_by_name,
    fw.performed_by_user_id,
    fw.vehicle_id,
    v.name AS vehicle_name,
    v.plate_number AS vehicle_plate,
    v.model AS vehicle_model,
    v.vehicle_type,
    fw.created_at,
    COALESCE(fw.source, 'tank_transfer') AS source,
    COALESCE(fw.is_financial_expense, false) AS is_financial_expense,
    NULL::jsonb AS receipt_media,
    NULL::jsonb AS invoice_image,
    NULL::uuid AS rental_id,
    NULL::text AS rental_reference,
    NULL::numeric AS fuel_lines_before,
    NULL::numeric AS fuel_lines_after,
    NULL::numeric AS liters_before,
    NULL::numeric AS liters_after
  FROM fuel_withdrawals fw
  LEFT JOIN saharax_0u4w4d_vehicles v ON v.id = fw.vehicle_id
),
operation_log_rows AS (
  SELECT
    'log-' || fol.id::text AS id,
    COALESCE(fol.created_at, NOW()) AS transaction_date,
    fol.transaction_type,
    COALESCE(fol.fuel_type, 'gasoline') AS fuel_type,
    COALESCE(fol.liters, 0)::numeric AS amount,
    COALESCE(fol.total_cost, 0)::numeric AS cost,
    COALESCE(fol.unit_price, 0)::numeric AS unit_price,
    fol.fuel_station,
    fol.location,
    fol.odometer_reading,
    fol.notes,
    fol.performed_by_name AS filled_by,
    COALESCE(fol.performed_by_name, 'System') AS performed_by_name,
    fol.performed_by_user_id,
    COALESCE(fol.vehicle_id, r.vehicle_id) AS vehicle_id,
    v.name AS vehicle_name,
    v.plate_number AS vehicle_plate,
    v.model AS vehicle_model,
    v.vehicle_type,
    fol.created_at,
    COALESCE(fol.source, fol.transaction_type) AS source,
    COALESCE(fol.is_financial_expense, false) AS is_financial_expense,
    fol.receipt_media,
    fol.receipt_media AS invoice_image,
    fol.rental_id,
    r.rental_id AS rental_reference,
    fol.fuel_lines_before,
    fol.fuel_lines_after,
    fol.liters_before,
    fol.liters_after
  FROM fuel_operation_logs fol
  LEFT JOIN app_4c3a7a6153_rentals r ON r.id = fol.rental_id
  LEFT JOIN saharax_0u4w4d_vehicles v ON v.id = COALESCE(fol.vehicle_id, r.vehicle_id)
  WHERE fol.transaction_type NOT IN ('tank_refill', 'vehicle_refill', 'withdrawal', 'tank_out')
)
SELECT * FROM refill_rows
UNION ALL
SELECT * FROM withdrawal_rows
UNION ALL
SELECT * FROM operation_log_rows;

COMMENT ON VIEW fuel_transactions_default_feed IS
  'Unified default feed for the All Fuel Transactions page, already ordered and merged at the database layer.';
