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
      otp_codes: {
        Row: {
          code_hash: string
          consumed: boolean
          created_at: string
          customer_id: string
          expires_at: string
          failed_attempts: number
          id: string
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
      outlets: {
        Row: {
          address: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
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
          id?: string
          location?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          customer_code: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          outlet_id: string | null
          phone: string | null
          referral_code: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          customer_code: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          outlet_id?: string | null
          phone?: string | null
          referral_code: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          customer_code?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
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
      my_outlet_id: { Args: never; Returns: string }
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
