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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          message: string | null
          resolved_at: string | null
          table_id: string | null
          team_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          message?: string | null
          resolved_at?: string | null
          table_id?: string | null
          team_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          message?: string | null
          resolved_at?: string | null
          table_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "club_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      bottles: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          price: number
          team_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          price: number
          team_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          price?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bottles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      club_tables: {
        Row: {
          assigned_to: string | null
          bottle_arrived_at: string | null
          bottle_waiting_at: string | null
          check_in_at: string | null
          closed_at: string | null
          created_at: string
          event_id: string
          fish_delivered_at: string | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          people_count: number
          ref_name: string
          selected_bottle_ids: string[] | null
          status: Database["public"]["Enums"]["table_status"]
          team_id: string
          total_amount: number | null
          updated_at: string
          whatsapp: string | null
          zone_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          bottle_arrived_at?: string | null
          bottle_waiting_at?: string | null
          check_in_at?: string | null
          closed_at?: string | null
          created_at?: string
          event_id: string
          fish_delivered_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          people_count?: number
          ref_name: string
          selected_bottle_ids?: string[] | null
          status?: Database["public"]["Enums"]["table_status"]
          team_id: string
          total_amount?: number | null
          updated_at?: string
          whatsapp?: string | null
          zone_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          bottle_arrived_at?: string | null
          bottle_waiting_at?: string | null
          check_in_at?: string | null
          closed_at?: string | null
          created_at?: string
          event_id?: string
          fish_delivered_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          people_count?: number
          ref_name?: string
          selected_bottle_ids?: string[] | null
          status?: Database["public"]["Enums"]["table_status"]
          team_id?: string
          total_amount?: number | null
          updated_at?: string
          whatsapp?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_tables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_tables_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_tables_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string
          date: string
          format_id: string | null
          headliner: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["event_status"]
          team_id: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          format_id?: string | null
          headliner?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          team_id: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          format_id?: string | null
          headliner?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          team_id?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      formats: {
        Row: {
          created_at: string
          id: string
          name: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      table_orders: {
        Row: {
          bottles: Json
          created_at: string
          created_by: string
          event_id: string
          id: string
          notes: string | null
          table_id: string
          team_id: string
          total: number
          type: Database["public"]["Enums"]["order_type"]
        }
        Insert: {
          bottles?: Json
          created_at?: string
          created_by: string
          event_id: string
          id?: string
          notes?: string | null
          table_id: string
          team_id: string
          total?: number
          type: Database["public"]["Enums"]["order_type"]
        }
        Update: {
          bottles?: Json
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          notes?: string | null
          table_id?: string
          team_id?: string
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
        }
        Relationships: [
          {
            foreignKeyName: "table_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "club_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["member_status"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_settings: {
        Row: {
          team_id: string
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_whatsapp_number: string | null
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          team_id: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          team_id?: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          id: string
          min_per_person: number
          name: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_per_person: number
          name: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_per_person?: number
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_team_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      alert_kind: "whatsapp_msg" | "bottle_late" | "help_needed"
      event_status: "upcoming" | "active" | "archived"
      member_status: "active" | "pending"
      order_type: "checkin" | "reorder"
      payment_method: "cash" | "pos"
      table_status:
        | "arriving"
        | "checkin"
        | "at_cashier"
        | "wristbands"
        | "fish_delivered"
        | "bottle_waiting"
        | "bottle_arrived"
        | "reorder"
        | "closed"
      team_role: "admin" | "staff"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      alert_kind: ["whatsapp_msg", "bottle_late", "help_needed"],
      event_status: ["upcoming", "active", "archived"],
      member_status: ["active", "pending"],
      order_type: ["checkin", "reorder"],
      payment_method: ["cash", "pos"],
      table_status: [
        "arriving",
        "checkin",
        "at_cashier",
        "wristbands",
        "fish_delivered",
        "bottle_waiting",
        "bottle_arrived",
        "reorder",
        "closed",
      ],
      team_role: ["admin", "staff"],
    },
  },
} as const
