ALTER TABLE public.app_687f658e98_tour_bookings REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.app_687f658e98_tour_bookings;
