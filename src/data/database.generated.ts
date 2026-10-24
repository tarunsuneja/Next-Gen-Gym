export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      action_requests: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          gym_id: string;
          id: string;
          payload: NonNullable<Json>;
          payload_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor: string;
          created_at?: string;
          gym_id: string;
          id: string;
          payload: NonNullable<Json>;
          payload_hash?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          gym_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          payload_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "action_requests_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          checked_at: string;
          checked_out_at: string | null;
          day: string;
          gym_id: string;
          id: string;
          member_id: string;
          override_reason: string;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string;
          checked_out_at?: string | null;
          day?: string;
          gym_id: string;
          id?: string;
          member_id: string;
          override_reason?: string;
        };
        Update: {
          checked_at?: string;
          checked_out_at?: string | null;
          day?: string;
          gym_id?: string;
          id?: string;
          member_id?: string;
          override_reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          gym_id: string;
          id: string;
          payload: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor: string;
          created_at?: string;
          gym_id: string;
          id?: string;
          payload: NonNullable<Json>;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          gym_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      gyms: {
        Row: {
          data_revision: number;
          address: string;
          id: string;
          name: string;
          phone: string;
          receipt_seq: number;
        };
        ComputedFields: never;
        Insert: {
          data_revision?: number;
          address?: string;
          id?: string;
          name: string;
          phone?: string;
          receipt_seq?: number;
        };
        Update: {
          data_revision?: number;
          address?: string;
          id?: string;
          name?: string;
          phone?: string;
          receipt_seq?: number;
        };
        Relationships: [];
      };
      members: {
        Row: {
          address: string;
          archived: boolean;
          dob: string | null;
          email: string;
          gender: string;
          gym_id: string;
          height: number | null;
          id: string;
          joined: string;
          left_on: string | null;
          name: string;
          notes: string;
          phone: string;
          photo: string;
          weight: number | null;
          whatsapp_consent: boolean;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          archived?: boolean;
          dob?: string | null;
          email?: string;
          gender?: string;
          gym_id: string;
          height?: number | null;
          id?: string;
          joined?: string;
          left_on?: string | null;
          name: string;
          notes?: string;
          phone: string;
          photo?: string;
          weight?: number | null;
          whatsapp_consent?: boolean;
        };
        Update: {
          address?: string;
          archived?: boolean;
          dob?: string | null;
          email?: string;
          gender?: string;
          gym_id?: string;
          height?: number | null;
          id?: string;
          joined?: string;
          left_on?: string | null;
          name?: string;
          notes?: string;
          phone?: string;
          photo?: string;
          weight?: number | null;
          whatsapp_consent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "members_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          amount: number;
          base_amount: number | null;
          cancel_reason: string;
          cancelled: boolean;
          discount_type: string;
          discount_value: number;
          due_date: string | null;
          end_date: string;
          freeze_end: string | null;
          freeze_reason: string;
          freeze_start: string | null;
          gym_id: string;
          id: string;
          member_id: string;
          plan_name: string;
          start_date: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          base_amount?: number | null;
          cancel_reason?: string;
          cancelled?: boolean;
          discount_type?: string;
          discount_value?: number;
          due_date?: string | null;
          end_date: string;
          freeze_end?: string | null;
          freeze_reason?: string;
          freeze_start?: string | null;
          gym_id: string;
          id?: string;
          member_id: string;
          plan_name: string;
          start_date: string;
        };
        Update: {
          amount?: number;
          base_amount?: number | null;
          cancel_reason?: string;
          cancelled?: boolean;
          discount_type?: string;
          discount_value?: number;
          due_date?: string | null;
          end_date?: string;
          freeze_end?: string | null;
          freeze_reason?: string;
          freeze_start?: string | null;
          gym_id?: string;
          id?: string;
          member_id?: string;
          plan_name?: string;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      message_dispatches: {
        Row: {
          body: string;
          dispatch_key: string;
          error: string;
          gym_id: string;
          member_id: string;
          phone: string;
          provider_id: string | null;
          state: string;
          template_name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          dispatch_key: string;
          error?: string;
          gym_id: string;
          member_id: string;
          phone?: string;
          provider_id?: string | null;
          state: string;
          template_name: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          dispatch_key?: string;
          error?: string;
          gym_id?: string;
          member_id?: string;
          phone?: string;
          provider_id?: string | null;
          state?: string;
          template_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_dispatches_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_dispatches_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      message_logs: {
        Row: {
          body: string;
          created_at: string;
          direction: string;
          error: string;
          gym_id: string;
          id: string;
          member_id: string | null;
          payload: NonNullable<Json>;
          phone: string;
          status: string;
          template_name: string;
          updated_at: string;
          wa_message_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          created_at?: string;
          direction?: string;
          error?: string;
          gym_id: string;
          id?: string;
          member_id?: string | null;
          payload?: NonNullable<Json>;
          phone?: string;
          status?: string;
          template_name?: string;
          updated_at?: string;
          wa_message_id?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          direction?: string;
          error?: string;
          gym_id?: string;
          id?: string;
          member_id?: string | null;
          payload?: NonNullable<Json>;
          phone?: string;
          status?: string;
          template_name?: string;
          updated_at?: string;
          wa_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_logs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_logs_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          gym_address: string;
          gym_id: string;
          gym_name: string;
          gym_phone: string;
          id: string;
          member_id: string;
          member_name: string;
          membership_id: string;
          method: string;
          paid_at: string;
          receipt: string;
          reference: string;
          request_id: string | null;
          void_reason: string;
          voided: boolean;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          gym_address: string;
          gym_id: string;
          gym_name: string;
          gym_phone: string;
          id?: string;
          member_id: string;
          member_name: string;
          membership_id: string;
          method: string;
          paid_at?: string;
          receipt: string;
          reference?: string;
          request_id?: string | null;
          void_reason?: string;
          voided?: boolean;
        };
        Update: {
          amount?: number;
          gym_address?: string;
          gym_id?: string;
          gym_name?: string;
          gym_phone?: string;
          id?: string;
          member_id?: string;
          member_name?: string;
          membership_id?: string;
          method?: string;
          paid_at?: string;
          receipt?: string;
          reference?: string;
          request_id?: string | null;
          void_reason?: string;
          voided?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "payments_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          gym_id: string;
          id: string;
          months: number;
          name: string;
          price: number;
        };
        ComputedFields: never;
        Insert: {
          gym_id: string;
          id?: string;
          months: number;
          name: string;
          price: number;
        };
        Update: {
          gym_id?: string;
          id?: string;
          months?: number;
          name?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plans_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_logs: {
        Row: {
          contacted_at: string;
          gym_id: string;
          id: string;
          kind: string;
          member_id: string;
          next_date: string | null;
          note: string;
        };
        ComputedFields: never;
        Insert: {
          contacted_at?: string;
          gym_id: string;
          id?: string;
          kind: string;
          member_id: string;
          next_date?: string | null;
          note?: string;
        };
        Update: {
          contacted_at?: string;
          gym_id?: string;
          id?: string;
          kind?: string;
          member_id?: string;
          next_date?: string | null;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_logs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_logs_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_rules: {
        Row: {
          audience: string;
          created_at: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          name: string;
          offset_days: number;
          template_name: string;
        };
        ComputedFields: never;
        Insert: {
          audience?: string;
          created_at?: string;
          gym_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          offset_days: number;
          template_name: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          offset_days?: number;
          template_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_rules_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_profiles: {
        Row: {
          enabled: boolean;
          gym_id: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          enabled?: boolean;
          gym_id: string;
          role: string;
          user_id: string;
        };
        Update: {
          enabled?: boolean;
          gym_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_profiles_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_config: {
        Row: {
          daily_send_cap: number;
          display_name: string;
          enabled: boolean;
          gym_id: string;
          phone_number_id: string;
          quiet_end: string;
          quiet_start: string;
          sender_phone: string;
          updated_at: string;
          waba_id: string;
        };
        ComputedFields: never;
        Insert: {
          daily_send_cap?: number;
          display_name?: string;
          enabled?: boolean;
          gym_id: string;
          phone_number_id?: string;
          quiet_end?: string;
          quiet_start?: string;
          sender_phone?: string;
          updated_at?: string;
          waba_id?: string;
        };
        Update: {
          daily_send_cap?: number;
          display_name?: string;
          enabled?: boolean;
          gym_id?: string;
          phone_number_id?: string;
          quiet_end?: string;
          quiet_start?: string;
          sender_phone?: string;
          updated_at?: string;
          waba_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: true;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          gym_id: string;
          id: string;
          is_active: boolean;
          language: string;
          meta_template_id: string;
          name: string;
          status: string;
          variables: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          category?: string;
          created_at?: string;
          gym_id: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          meta_template_id?: string;
          name: string;
          status?: string;
          variables?: NonNullable<Json>;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          gym_id?: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          meta_template_id?: string;
          name?: string;
          status?: string;
          variables?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      compact_audit_payload: { Args: { p: Json }; Returns: Json };
      get_gym_data: { Args: Record<PropertyKey, never>; Returns: Json };
      get_gym_dashboard: { Args: Record<PropertyKey, never>; Returns: Json };
      get_attendance_page: {
        Args: {
          p_limit?: number;
          p_before_at?: string;
          p_before_id?: string;
          p_query?: string;
          p_from?: string;
          p_to?: string;
          p_inside?: boolean;
        };
        Returns: Json;
      };
      get_payment_export_page: {
        Args: {
          p_limit?: number;
          p_after_at?: string;
          p_after_id?: string;
          p_revision?: string;
          p_query?: string;
          p_from?: string;
          p_to?: string;
          p_exclude_voided?: boolean;
        };
        Returns: Json;
      };
      get_gym_sections: { Args: { p_sections?: string[] }; Returns: Json };
      get_history_page: {
        Args: {
          p_before_at?: string;
          p_before_id?: string;
          p_exclude_voided?: boolean;
          p_from?: string;
          p_kind: string;
          p_limit?: number;
          p_query?: string;
          p_to?: string;
        };
        Returns: Json;
      };
      gym_action: {
        Args: { action_type: string; payload: Json; request_id: string };
        Returns: undefined;
      };
      my_gym: { Args: Record<PropertyKey, never>; Returns: string };
      my_role: { Args: Record<PropertyKey, never>; Returns: string };
      photo_object_key: { Args: { p_photo: string }; Returns: string };
      wa_claim_dispatch: {
        Args: {
          p_gym: string;
          p_key: string;
          p_member: string;
          p_template: string;
        };
        Returns: boolean;
      };
      wa_due_messages: {
        Args: { p_limit?: number; p_run_date?: string };
        Returns: Json;
      };
      wa_finish_dispatch: {
        Args: {
          p_body: string;
          p_error?: string;
          p_gym: string;
          p_key: string;
          p_member: string;
          p_phone: string;
          p_provider?: string;
          p_state: string;
          p_template: string;
        };
        Returns: undefined;
      };
      wa_prepare: {
        Args: {
          p_gym: string;
          p_member: string;
          p_run_date?: string;
          p_template: string;
        };
        Returns: Json;
      };
      wa_record: {
        Args: {
          p_body: string;
          p_direction: string;
          p_error: string;
          p_gym: string;
          p_member: string;
          p_phone: string;
          p_status: string;
          p_template: string;
          p_wa_id: string;
        };
        Returns: string;
      };
      wa_record_inbound: {
        Args: {
          p_body: string;
          p_from: string;
          p_number: string;
          p_wa_id: string;
        };
        Returns: undefined;
      };
      wa_set_status: {
        Args: {
          p_error: string;
          p_number: string;
          p_status: string;
          p_wa_id: string;
        };
        Returns: undefined;
      };
      wa_template_vars: {
        Args: {
          p_gym: string;
          p_member: string;
          p_run_date: string;
          p_template: string;
        };
        Returns: Json;
      };
      wa_vars: {
        Args: { p_gym: string; p_member: string; p_run_date: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
