// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Token transfer source restrictions", () => {
  const db = new PGlite();
  const welcomeOnly = "00000000-0000-0000-0000-000000000001";
  const earned = "00000000-0000-0000-0000-000000000002";
  const purchased = "00000000-0000-0000-0000-000000000003";
  const recipient = "00000000-0000-0000-0000-000000000004";

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.token_accounts (
        customer_id uuid PRIMARY KEY,
        available_tokens bigint NOT NULL DEFAULT 0,
        locked_tokens bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.token_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL,
        tx_type text NOT NULL,
        amount bigint NOT NULL,
        to_available bigint NOT NULL DEFAULT 0,
        to_locked bigint NOT NULL DEFAULT 0,
        available_after bigint NOT NULL,
        locked_after bigint NOT NULL,
        reference text NOT NULL,
        related_transfer_id uuid,
        related_customer_id uuid,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT token_ledger_tx_type_check CHECK (tx_type IN ('welcome','reward'))
      );
      CREATE TABLE public.token_transfers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL,
        recipient_id uuid NOT NULL,
        principal_tokens bigint NOT NULL,
        fee_tokens bigint NOT NULL DEFAULT 10,
        status text NOT NULL DEFAULT 'success',
        reference text NOT NULL
      );
      INSERT INTO public.token_accounts(customer_id) VALUES
        ('${welcomeOnly}'), ('${earned}'), ('${purchased}'), ('${recipient}');
      UPDATE public.token_accounts SET available_tokens = 100 WHERE customer_id = '${welcomeOnly}';
    `);
    await db.exec(readFileSync("drizzle/migrations/0028_non_transferable_welcome_tokens.sql", "utf8"));
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it("keeps welcome-only balances non-transferable", async () => {
    await expect(db.query(
      "INSERT INTO public.token_transfers(sender_id, recipient_id, principal_tokens, fee_tokens, reference) VALUES ($1, $2, 10, 10, 'WELCOME-TRANSFER')",
      [welcomeOnly, recipient],
    )).rejects.toThrow(/Welcome tokens cannot be transferred/);
  });

  it("marks earned and purchased credits as transferable", async () => {
    await db.exec(`
      UPDATE public.token_accounts SET available_tokens = 50 WHERE customer_id = '${earned}';
      INSERT INTO public.token_ledger(customer_id, tx_type, amount, to_available, available_after, locked_after, reference)
        VALUES ('${earned}', 'reward', 50, 50, 50, 0, 'DAILY-TEST');
    `);
    await db.query("SELECT public.credit_purchased_tokens($1, $2, $3)", [purchased, 40, "PAY-TEST"]);

    const { rows } = await db.query<{ customer_id: string; transferable_tokens: number }>(
      "SELECT customer_id, transferable_tokens FROM public.token_accounts WHERE customer_id IN ($1, $2) ORDER BY customer_id",
      [earned, purchased],
    );
    expect(rows).toEqual([
      { customer_id: earned, transferable_tokens: 50 },
      { customer_id: purchased, transferable_tokens: 40 },
    ]);
  });

  it("requires the transfer principal and fee to come from transferable tokens", async () => {
    await expect(db.query(
      "INSERT INTO public.token_transfers(sender_id, recipient_id, principal_tokens, fee_tokens, reference) VALUES ($1, $2, 45, 10, 'EARNED-TOO-LARGE')",
      [earned, recipient],
    )).rejects.toThrow(/Welcome tokens cannot be transferred/);

    await db.query(
      "INSERT INTO public.token_transfers(sender_id, recipient_id, principal_tokens, fee_tokens, reference) VALUES ($1, $2, 40, 10, 'EARNED-VALID')",
      [earned, recipient],
    );
  });
});
