REVOKE ALL ON FUNCTION public.apply_wallet_funding(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_funding(uuid,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.activate_subscription(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid,text) TO service_role;