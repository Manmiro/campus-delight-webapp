export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      credit_limit_history: {
        Row: {
          adjustment_type: string
          created_at: string
          customer_id: string
          id: string
          new_limit_kobo: number
          notes: string | null
          previous_limit_kobo: number
          trigger_loan_id: string | null
        }
        Insert: {
          adjustment_type: string
          created_at?: string
          customer_id: string
          id?: string
          new_limit_kobo: number
          notes?: string | null
          previous_limit_kobo: number
          trigger_loan_id?: string | null
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          customer_id?: string
          id?: string
          new_limit_kobo?: number
          notes?: string | null
          previous_limit_kobo?: number
          trigger_loan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_limit_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_limit_history_trigger_loan_id_fkey"
            columns: ["trigger_loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit: {
        Row: {
          credit_limit_kobo: number
          customer_id: string
          outstanding_kobo: number
          updated_at: string
        }
        Insert: {
          credit_limit_kobo?: number
          customer_id: string
          outstanding_kobo?: number
          updated_at?: string
        }
        Update: {
          credit_limit_kobo?: number
          customer_id?: string
          outstanding_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          bonus_tokens: number
          checkin_date: string
          created_at: string
          customer_id: string
          id: string
          spin_tokens: number
          streak: number
        }
        Insert: {
          bonus_tokens?: number
          checkin_date: string
          created_at?: string
          customer_id: string
          id?: string
          spin_tokens: number
          streak: number
        }
        Update: {
          bonus_tokens?: number
          checkin_date?: string
          created_at?: string
          customer_id?: string
          id?: string
          spin_tokens?: number
          streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_checkins_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_reminder_sends: {
        Row: {
          days_left: number
          loan_id: string
          reminder_date: string
          sent_at: string
        }
        Insert: {
          days_left: number
          loan_id: string
          reminder_date: string
          sent_at?: string
        }
        Update: {
          days_left?: number
          loan_id?: string
          reminder_date?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_reminder_sends_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          amount_kobo: number
          created_at: string
          customer_id: string
          id: string
          loan_id: string
          method: string
          reference: string
          status: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          customer_id: string
          id?: string
          loan_id: string
          method?: string
          reference: string
          status?: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          customer_id?: string
          id?: string
          loan_id?: string
          method?: string
          reference?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          charge_kobo: number
          created_at: string
          customer_id: string
          due_at: string
          id: string
          item_summary: string | null
          outlet_id: string
          overdue_kobo: number
          principal_kobo: number
          settled_at: string | null
          status: string
          term_days: number
          total_due_kobo: number
        }
        Insert: {
          charge_kobo: number
          created_at?: string
          customer_id: string
          due_at: string
          id?: string
          item_summary?: string | null
          outlet_id: string
          overdue_kobo?: number
          principal_kobo: number
          settled_at?: string | null
          status?: string
          term_days: number
          total_due_kobo: number
        }
        Update: {
          charge_kobo?: number
          created_at?: string
          customer_id?: string
          due_at?: string
          id?: string
          item_summary?: string | null
          outlet_id?: string
          overdue_kobo?: number
          principal_kobo?: number
          settled_at?: string | null
          status?: string
          term_days?: number
          total_due_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_entitlements: {
        Row: {
          allowance: number
          customer_id: string
          id: string
          redeemed: number
          service_date: string
          subscription_id: string
        }
        Insert: {
          allowance: number
          customer_id: string
          id?: string
          redeemed?: number
          service_date: string
          subscription_id: string
        }
        Update: {
          allowance?: number
          customer_id?: string
          id?: string
          redeemed?: number
          service_date?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_entitlements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_credit_eligible: boolean
          name: string
          outlet_id: string
          price_kobo: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_credit_eligible?: boolean
          name: string
          outlet_id: string
          price_kobo: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_credit_eligible?: boolean
          name?: string
          outlet_id?: string
          price_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          customer_id: string
          id: string
          is_read: boolean
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          customer_id: string
          id?: string
          is_read?: boolean
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_read?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          item_name: string
          menu_item_id: string | null
          order_id: string
          quantity: number
          unit_price_kobo: number
        }
        Insert: {
          id?: string
          item_name: string
          menu_item_id?: string | null
          order_id: string
          quantity: number
          unit_price_kobo: number
        }
        Update: {
          id?: string
          item_name?: string
          menu_item_id?: string | null
          order_id?: string
          quantity?: number
          unit_price_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          delivery_address: string | null
          delivery_fee_kobo: number
          fulfilled_at: string | null
          fulfillment_method: string
          id: string
          loan_id: string | null
          outlet_id: string
          payment_method: string
          reference: string
          status: string
          subscription_id: string | null
          tokens_used: number | null
          total_kobo: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_address?: string | null
          delivery_fee_kobo?: number
          fulfilled_at?: string | null
          fulfillment_method?: string
          id?: string
          loan_id?: string | null
          outlet_id: string
          payment_method: string
          reference: string
          status?: string
          subscription_id?: string | null
          tokens_used?: number | null
          total_kobo: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_address?: string | null
          delivery_fee_kobo?: number
          fulfilled_at?: string | null
          fulfillment_method?: string
          id?: string
          loan_id?: string | null
          outlet_id?: string
          payment_method?: string
          reference?: string
          status?: string
          subscription_id?: string | null
          tokens_used?: number | null
          total_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code_hash: string
          consumed: boolean
          created_at: string
          customer_id: string
          expires_at: string
          failed_attempts: number
          id: string
          phone: string | null
          purpose: string
        }
        Insert: {
          code_hash: string
          consumed?: boolean
          created_at?: string
          customer_id: string
          expires_at: string
          failed_attempts?: number
          id?: string
          phone?: string | null
          purpose?: string
        }
        Update: {
          code_hash?: string
          consumed?: boolean
          created_at?: string
          customer_id?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          phone?: string | null
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "otp_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_plan_prices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          outlet_id: string
          plan: string
          price_kobo: number
          tier: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          outlet_id: string
          plan: string
          price_kobo: number
          tier: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          outlet_id?: string
          plan?: string
          price_kobo?: number
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_plan_prices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_staff: {
        Row: {
          id: string
          outlet_id: string
          staff_role: string
          user_id: string
        }
        Insert: {
          id?: string
          outlet_id: string
          staff_role: string
          user_id: string
        }
        Update: {
          id?: string
          outlet_id?: string
          staff_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_staff_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_transfer_applications: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string
          decided_at: string | null
          fee_amount: number
          fee_method: string
          from_outlet_id: string
          id: string
          reference: string
          reviewed_by: string | null
          status: string
          to_outlet_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id: string
          decided_at?: string | null
          fee_amount: number
          fee_method: string
          from_outlet_id: string
          id?: string
          reference: string
          reviewed_by?: string | null
          status?: string
          to_outlet_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          decided_at?: string | null
          fee_amount?: number
          fee_method?: string
          from_outlet_id?: string
          id?: string
          reference?: string
          reviewed_by?: string | null
          status?: string
          to_outlet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_transfer_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_transfer_applications_from_outlet_id_fkey"
            columns: ["from_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_transfer_applications_to_outlet_id_fkey"
            columns: ["to_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          delivery_fee_kobo: number
          id: string
          location: string | null
          name: string
          status: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_fee_kobo?: number
          id?: string
          location?: string | null
          name: string
          status?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_fee_kobo?: number
          id?: string
          location?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount_kobo: number
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string | null
          payload: Json | null
          paystack_reference: string
          purpose: string
          related_id: string | null
          status: string
          verified_at: string | null
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          paystack_reference: string
          purpose: string
          related_id?: string | null
          status?: string
          verified_at?: string | null
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
          paystack_reference?: string
          purpose?: string
          related_id?: string | null
          status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          customer_code: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          leaderboard_opt_in: boolean
          outlet_id: string | null
          phone: string | null
          referral_code: string
          verification_status: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          customer_code: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id: string
          is_active?: boolean
          leaderboard_opt_in?: boolean
          outlet_id?: string | null
          phone?: string | null
          referral_code: string
          verification_status?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          customer_code?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          leaderboard_opt_in?: boolean
          outlet_id?: string | null
          phone?: string | null
          referral_code?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          locked_tokens: number
          referred_id: string
          referrer_id: string
          rewarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_tokens?: number
          referred_id: string
          referrer_id: string
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_tokens?: number
          referred_id?: string
          referrer_id?: string
          rewarded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          created_at: string
          customer_id: string
          end_date: string | null
          id: string
          outlet_id: string
          payment_reference: string | null
          plan: string
          price_kobo: number
          start_date: string | null
          status: string
          tier: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          customer_id: string
          end_date?: string | null
          id?: string
          outlet_id: string
          payment_reference?: string | null
          plan: string
          price_kobo: number
          start_date?: string | null
          status?: string
          tier: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          customer_id?: string
          end_date?: string | null
          id?: string
          outlet_id?: string
          payment_reference?: string | null
          plan?: string
          price_kobo?: number
          start_date?: string | null
          status?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      token_accounts: {
        Row: {
          available_tokens: number
          customer_id: string
          locked_tokens: number
          updated_at: string
        }
        Insert: {
          available_tokens?: number
          customer_id: string
          locked_tokens?: number
          updated_at?: string
        }
        Update: {
          available_tokens?: number
          customer_id?: string
          locked_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          amount: number
          available_after: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          locked_after: number
          reference: string
          related_customer_id: string | null
          related_transfer_id: string | null
          to_available: number
          to_locked: number
          tx_type: string
        }
        Insert: {
          amount: number
          available_after: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          locked_after: number
          reference: string
          related_customer_id?: string | null
          related_transfer_id?: string | null
          to_available?: number
          to_locked?: number
          tx_type: string
        }
        Update: {
          amount?: number
          available_after?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          locked_after?: number
          reference?: string
          related_customer_id?: string | null
          related_transfer_id?: string | null
          to_available?: number
          to_locked?: number
          tx_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transfers: {
        Row: {
          created_at: string
          fee_tokens: number
          id: string
          principal_tokens: number
          recipient_id: string
          reference: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          fee_tokens?: number
          id?: string
          principal_tokens: number
          recipient_id: string
          reference: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          fee_tokens?: number
          id?: string
          principal_tokens?: number
          recipient_id?: string
          reference?: string
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transfers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transfers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount_kobo: number
          balance_after_kobo: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          reference: string
          related_loan_id: string | null
          related_order_id: string | null
          related_payment_id: string | null
          tx_type: string
        }
        Insert: {
          amount_kobo: number
          balance_after_kobo: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          reference: string
          related_loan_id?: string | null
          related_order_id?: string | null
          related_payment_id?: string | null
          tx_type: string
        }
        Update: {
          amount_kobo?: number
          balance_after_kobo?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          reference?: string
          related_loan_id?: string | null
          related_order_id?: string | null
          related_payment_id?: string | null
          tx_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_kobo: number
          customer_id: string
          updated_at: string
        }
        Insert: {
          balance_kobo?: number
          customer_id: string
          updated_at?: string
        }
        Update: {
          balance_kobo?: number
          customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_subscription: {
        Args: { p_reference: string; p_subscription_id: string }
        Returns: boolean
      }
      admin_adjust_credit_limit: {
        Args: { p_customer: string; p_new_limit_kobo: number; p_reason: string }
        Returns: Json
      }
      apply_outlet_transfer: {
        Args: { p_fee_method: string; p_to_outlet_id: string }
        Returns: Json
      }
      apply_wallet_funding: {
        Args: {
          p_amount_kobo: number
          p_customer_id: string
          p_reference: string
        }
        Returns: boolean
      }
      apply_wallet_refund: {
        Args: {
          p_amount_kobo: number
          p_customer_id: string
          p_order_id: string
          p_reference: string
        }
        Returns: undefined
      }
      cancel_order: { Args: { p_order_id: string }; Returns: undefined }
      claim_daily_checkin: { Args: never; Returns: Json }
      due_loan_reminders: {
        Args: never
        Returns: {
          balance_kobo: number
          customer_id: string
          days_left: number
          due_at: string
          email: string
          full_name: string
          gender: string
          item_summary: string
          loan_id: string
          outlet_name: string
          reminder_date: string
        }[]
      }
      fulfill_order: { Args: { p_order_id: string }; Returns: undefined }
      get_config: { Args: { _key: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_central_admin: { Args: never; Returns: boolean }
      is_outlet_manager: { Args: { _outlet_id: string }; Returns: boolean }
      is_outlet_staff: { Args: { _outlet_id: string }; Returns: boolean }
      issue_sms_otp: { Args: { p_customer: string }; Returns: Json }
      lock_referral_reward: {
        Args: { p_referred_id: string; p_referrer_id: string }
        Returns: undefined
      }
      my_outlet_id: { Args: never; Returns: string }
      place_order: {
        Args: {
          p_items: Json
          p_loan_term_days?: number
          p_payment_method: string
          p_subscription_id?: string
        }
        Returns: Json
      }
      place_order_with_fulfillment: {
        Args: {
          p_delivery_address?: string
          p_expected_fee_kobo?: number
          p_fulfillment_method: string
          p_items: Json
          p_loan_term_days?: number
          p_payment_method: string
          p_subscription_id?: string
        }
        Returns: Json
      }
      prepare_card_order: {
        Args: { p_customer_id: string; p_items: Json; p_reference: string }
        Returns: string
      }
      repay_loan: {
        Args: { p_amount_kobo: number; p_loan_id: string }
        Returns: Json
      }
      request_otp: { Args: { p_purpose?: string }; Returns: string }
      set_outlet_delivery_fee: {
        Args: { p_fee_kobo: number; p_outlet_id: string }
        Returns: undefined
      }
      settle_verified_payment: {
        Args: {
          p_amount_kobo: number
          p_currency: string
          p_payload: Json
          p_reference: string
        }
        Returns: Json
      }
      transfer_tokens: {
        Args: {
          p_principal: number
          p_recipient_identifier: string
          p_reference?: string
        }
        Returns: Json
      }
      unlock_referral_reward: {
        Args: { p_referred_id: string }
        Returns: undefined
      }
      verify_otp: { Args: { p_code: string }; Returns: boolean }
      weekly_leaderboard: {
        Args: never
        Returns: {
          checkins: number
          display_name: string
          is_me: boolean
          orders: number
          points: number
          rank: number
        }[]
      }
    }
    Enums: {
      app_role: "customer" | "outlet_manager" | "outlet_staff" | "central_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "outlet_manager", "outlet_staff", "central_admin"],
    },
  },
} as const
