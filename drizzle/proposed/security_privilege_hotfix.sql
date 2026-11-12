-- Approved security containment: internal financial helpers are never browser RPCs.
BEGIN;
REVOKE ALL ON FUNCTION public.apply_wallet_refund(uuid,bigint,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_referral_reward(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_referral_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_refund(uuid,bigint,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_referral_reward(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_referral_reward(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
