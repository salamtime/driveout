ALTER TABLE public.app_687f658e98_activity_log REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime
ADD TABLE public.app_687f658e98_activity_log;
