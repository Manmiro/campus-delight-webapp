import { supabaseAdmin as db } from '@/integrations/supabase/client.server';

/**
 * Claims a logical email send before it goes out. Returns false when the same
 * key was already claimed, so refreshes, webhook retries and repeat sign-ins
 * never send the same email twice.
 */
export async function claimEmailSend(idempotencyKey: string, templateName: string): Promise<boolean> {
  const { data, error } = await db
    .from('email_send_claims')
    .upsert({ idempotency_key: idempotencyKey, template_name: templateName }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    .select('idempotency_key');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Releases a claim when delivery failed, so a later retry may still send it once. */
export async function releaseEmailSend(idempotencyKey: string): Promise<void> {
  await db.from('email_send_claims').delete().eq('idempotency_key', idempotencyKey);
}
