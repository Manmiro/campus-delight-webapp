DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.place_order_with_fulfillment(jsonb,text,text,text,bigint,uuid,integer)'::regprocedure) INTO definition;
definition:=replace(definition, 'm2.name||'' x''||it->>''quantity''', 'm2.name||'' x''||(it->>''quantity'')');
definition:=replace(definition, ' UPDATE public.wallet_ledger SET related_order_id=v_order_id WHERE customer_id=v_customer AND reference=v_ref AND tx_type=''debit'';', '');
EXECUTE definition;
END; $$;