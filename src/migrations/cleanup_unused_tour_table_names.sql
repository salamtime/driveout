-- Safe cleanup for old tour package table names that are no longer used.
-- Run only after you confirm your live data is in:
--   public.app_687f658e98_tour_packages
--   public.app_687f658e98_tour_bookings

DROP TABLE IF EXISTS public.app_cf88e679bb_tour_packages;

-- Keep these as the source of truth:
-- public.app_687f658e98_tour_packages
-- public.app_687f658e98_tour_bookings
