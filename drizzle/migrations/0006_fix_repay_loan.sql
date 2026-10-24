create or replace function public.repay_loan(p_loan_id uuid, p_amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  l record;
  v_paid bigint;
  v_balance bigint;
  v_outstanding bigint;
  v_ref text;
  v_prev_limit bigint;
  v_new_limit bigint;
  v_adj text;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'Invalid repayment amount'; end if;
  select * into l from public.loans where id = p_loan_id and customer_id = v_customer for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status in ('fully_repaid_on_time','fully_repaid_late','cancelled','written_off') then raise exception 'Loan already settled'; end if;

  select balance_kobo into v_balance from public.wallets where customer_id = v_customer for update;
  if v_balance < p_amount_kobo then raise exception 'Insufficient wallet balance'; end if;
  update public.wallets set balance_kobo = balance_kobo - p_amount_kobo, updated_at = now()
    where customer_id = v_customer returning balance_kobo into v_balance;
  v_ref := 'REP-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, related_loan_id, description)
    values (v_customer, 'debit', -(p_amount_kobo), v_balance, v_ref, l.id, 'Loan repayment');
  insert into public.loan_repayments (loan_id, customer_id, amount_kobo, method, status, reference)
    values (l.id, v_customer, p_amount_kobo, 'cash_wallet', 'successful', v_ref);

  select coalesce(sum(amount_kobo), 0) into v_paid from public.loan_repayments where loan_id = l.id and status = 'successful';
  v_outstanding := l.total_due_kobo + l.overdue_kobo - v_paid;
  if v_outstanding < 0 then v_outstanding := 0; end if;

  if v_outstanding = 0 then
    if now() <= l.due_at then
      update public.loans set status = 'fully_repaid_on_time', settled_at = now() where id = l.id;
      select credit_limit_kobo into v_prev_limit from public.customer_credit where customer_id = v_customer;
      v_new_limit := v_prev_limit * 2;
      v_adj := 'timely_double';
    else
      update public.loans set status = 'fully_repaid_late', settled_at = now() where id = l.id;
      select credit_limit_kobo into v_prev_limit from public.customer_credit where customer_id = v_customer;
      v_new_limit := floor(v_prev_limit::numeric * 0.70)::bigint;
      v_adj := 'untimely_reduce';
    end if;
    update public.customer_credit set credit_limit_kobo = v_new_limit, updated_at = now() where customer_id = v_customer;
    insert into public.credit_limit_history (customer_id, previous_limit_kobo, new_limit_kobo, adjustment_type, trigger_loan_id, notes)
      values (v_customer, v_prev_limit, v_new_limit, v_adj, l.id, case when v_adj = 'timely_double' then 'Timely full repayment: limit doubled' else 'Late full repayment: limit reduced by exactly 30%' end);
    insert into public.notifications (customer_id, title, body)
      values (v_customer, 'Loan settled', case when v_adj = 'timely_double' then 'Loan settled on time. Your credit limit doubled to ₦' || (v_new_limit / 100.0)::text else 'Loan settled late. Your credit limit is now ₦' || (v_new_limit / 100.0)::text end);
  else
    if now() > l.due_at then
      update public.loans set status = 'overdue' where id = l.id;
    else
      update public.loans set status = 'partially_repaid' where id = l.id;
    end if;
    insert into public.notifications (customer_id, title, body)
      values (v_customer, 'Repayment received', '₦' || (p_amount_kobo / 100.0)::text || ' applied. Outstanding: ₦' || (v_outstanding / 100.0)::text);
  end if;

  update public.customer_credit set outstanding_kobo = greatest(v_outstanding, 0), updated_at = now() where customer_id = v_customer;

  return jsonb_build_object('reference', v_ref, 'outstanding_kobo', v_outstanding, 'status', case when v_outstanding = 0 then v_adj else 'partially_repaid' end);
end;
$$;

revoke execute on function public.repay_loan(uuid, bigint) from anon;
grant execute on function public.repay_loan(uuid, bigint) to authenticated;
