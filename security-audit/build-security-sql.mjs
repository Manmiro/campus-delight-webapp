import fs from 'node:fs';
const file='drizzle/proposed/security_boundaries.sql';
const source=fs.readFileSync('drizzle/migrations/0048_subscription_wallet_checkout.sql','utf8').replaceAll('\r\n','\n');
const replace=(s,a,b)=>{if(!s.includes(a))throw new Error(`Missing SQL fragment: ${a}`);return s.replace(a,()=>b);};
let prepare=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.prepare_subscription_payment'),source.indexOf('-- Keep payment history'));
prepare=replace(prepare,'paystack_reference, status, related_id)','paystack_reference, status, related_id, checkout_snapshot)');
prepare=replace(prepare,"v_price, p_reference, 'pending', s.id);",`v_price, p_reference, 'pending', s.id,
      jsonb_build_object('customer_id',p_customer_id,'outlet_id',v_outlet,'plan',s.plan,'tier',s.tier,'price_kobo',v_price));`);
let settle=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.settle_verified_payment'));
settle=replace(settle,"ELSIF s.status IN ('awaiting_payment','renewal_pending') AND s.price_kobo = tx.amount_kobo THEN",`ELSIF s.status IN ('awaiting_payment','renewal_pending') AND s.price_kobo = tx.amount_kobo
      AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.outlets quoted_outlet ON quoted_outlet.id=p.outlet_id
        WHERE p.id=s.customer_id AND p.is_active AND p.outlet_id=s.outlet_id AND quoted_outlet.status='active')
      AND (tx.checkout_snapshot = jsonb_build_object('customer_id',s.customer_id,'outlet_id',s.outlet_id,'plan',s.plan,'tier',s.tier,'price_kobo',s.price_kobo)
        OR (tx.checkout_snapshot IS NULL AND EXISTS(SELECT 1 FROM public.outlet_plan_prices price
          WHERE price.outlet_id=s.outlet_id AND price.plan=s.plan AND price.tier=s.tier AND price.is_active AND price.price_kobo=tx.amount_kobo))) THEN`);
let target=fs.readFileSync(file,'utf8');
if(target.includes('-- Bind settlement to the plan')) target=target.slice(0,target.indexOf('-- Bind settlement to the plan'))+"NOTIFY pgrst,'reload schema';\nCOMMIT;";
target=replace(target,"NOTIFY pgrst,'reload schema';\nCOMMIT;",`-- Bind settlement to the plan and outlet that were actually quoted. Old pending
-- payments without snapshots are revalidated; mismatches are credited once to
-- the wallet, preserving funds and historical callback support.
${prepare}
${settle}
NOTIFY pgrst,'reload schema';
COMMIT;`);
fs.writeFileSync(file,target);
