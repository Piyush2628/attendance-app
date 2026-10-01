// Hand-written to match supabase/migrations/01_schema.sql.
// Once a Supabase project exists, regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
// (then re-add the RPC result types at the bottom of this file).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type WageType = "daily" | "hourly" | "monthly";
export type AttendanceStatus = "present" | "half_day" | "absent";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      owner_settings: {
        Row: {
          owner_id: string;
          business_name: string;
          timezone: string;
          kiosk_code: string;
          currency: string;
          created_at: string;
          work_lat: number | null;
          work_lng: number | null;
          work_radius_m: number;
          gps_required: boolean;
        };
        Insert: never;
        Update: {
          business_name?: string;
          timezone?: string;
          currency?: string;
          work_lat?: number | null;
          work_lng?: number | null;
          work_radius_m?: number;
          gps_required?: boolean;
        };
        Relationships: [];
      };
      workers: {
        // pin_hash and lockout columns are not readable by clients.
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string | null;
          photo_url: string | null;
          wage_type: WageType;
          daily_rate: number;
          hourly_rate: number;
          monthly_salary: number;
          standard_shift_hours: number;
          ot_rate_per_hour: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          photo_url?: string | null;
          wage_type?: WageType;
          daily_rate?: number;
          hourly_rate?: number;
          monthly_salary?: number;
          standard_shift_hours?: number;
          ot_rate_per_hour?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          phone?: string | null;
          photo_url?: string | null;
          wage_type?: WageType;
          daily_rate?: number;
          hourly_rate?: number;
          monthly_salary?: number;
          standard_shift_hours?: number;
          ot_rate_per_hour?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      attendance_logs: {
        Row: {
          id: string;
          worker_id: string;
          date: string;
          clock_in: string | null;
          clock_out: string | null;
          total_minutes: number | null;
          status: AttendanceStatus;
          ot_minutes: number;
          manual_override: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          clock_in_lat: number | null;
          clock_in_lng: number | null;
          clock_in_accuracy_m: number | null;
          clock_in_distance_m: number | null;
          clock_out_lat: number | null;
          clock_out_lng: number | null;
          clock_out_accuracy_m: number | null;
          clock_out_distance_m: number | null;
        };
        Insert: {
          id?: string;
          worker_id: string;
          date?: string;
          clock_in?: string | null;
          clock_out?: string | null;
          status?: AttendanceStatus;
          ot_minutes?: number;
          manual_override?: boolean;
          notes?: string | null;
        };
        Update: {
          date?: string;
          clock_in?: string | null;
          clock_out?: string | null;
          status?: AttendanceStatus;
          ot_minutes?: number;
          manual_override?: boolean;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_logs_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      advances: {
        Row: {
          id: string;
          worker_id: string;
          date: string;
          amount: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          worker_id: string;
          date?: string;
          amount: number;
          notes?: string | null;
        };
        Update: {
          date?: string;
          amount?: number;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "advances_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_worker_pin: {
        Args: { p_worker_id: string; p_pin: string };
        Returns: undefined;
      };
      mark_attendance: {
        Args: {
          p_worker_id: string;
          p_date: string;
          p_status: AttendanceStatus;
          p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["attendance_logs"]["Row"];
      };
      payroll_report: {
        Args: { p_start: string; p_end: string };
        Returns: PayrollRow[];
      };
      kiosk_list_workers: { Args: { p_kiosk_code: string }; Returns: Json };
      kiosk_verify_pin: {
        Args: { p_kiosk_code: string; p_worker_id: string; p_pin: string };
        Returns: Json;
      };
      kiosk_punch: {
        Args: { p_kiosk_code: string; p_worker_id: string; p_pin: string } & PunchLocationArgs;
        Returns: Json;
      };
      worker_login: {
        Args: { p_kiosk_code: string; p_phone: string; p_pin: string };
        Returns: Json;
      };
      worker_status: { Args: { p_token: string }; Returns: Json };
      worker_punch: { Args: { p_token: string } & PunchLocationArgs; Returns: Json };
      worker_logout: { Args: { p_token: string }; Returns: undefined };
    };
    Enums: {
      wage_type: WageType;
      attendance_status: AttendanceStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Worker = Database["public"]["Tables"]["workers"]["Row"];
export type AttendanceLog = Database["public"]["Tables"]["attendance_logs"]["Row"];
export type Advance = Database["public"]["Tables"]["advances"]["Row"];
export type OwnerSettings = Database["public"]["Tables"]["owner_settings"]["Row"];

// ---- RPC result shapes (jsonb functions) -------------------------------------

/** Device location sent with a punch (04_gps.sql). All null when not sent. */
type PunchLocationArgs = { p_lat?: number | null; p_lng?: number | null; p_accuracy?: number | null };

/** A browser geolocation fix. */
export type GeoFix = { lat: number; lng: number; accuracy: number };

export type PayrollRow = {
  worker_id: string;
  worker_name: string;
  wage_type: WageType;
  days_present: number;
  half_days: number;
  absent_days: number;
  open_punches: number;
  worked_hours: number;
  ot_hours: number;
  base_pay: number;
  ot_pay: number;
  gross_pay: number;
  advances_total: number;
  net_payable: number;
};

export type PunchErrorCode =
  | "invalid_code"
  | "not_found"
  | "locked"
  | "wrong_pin"
  | "no_pin"
  | "invalid_session"
  | "already_done_today"
  // GPS check (04_gps.sql)
  | "location_needed"
  | "outside_area"
  | "location_weak"
  // Client-side only: the request never reached the server (no internet).
  | "offline"
  // Client-side only: the browser would not give a location.
  | "location_denied"
  | "location_unavailable";

export type PunchError = {
  ok: false;
  error: PunchErrorCode;
  attempts_left?: number;
  locked_until?: string;
  /** outside_area / location_weak: how far the punch was from work. */
  distance_m?: number;
  radius_m?: number;
  accuracy_m?: number | null;
};

export type WorkerSummary = {
  ok: true;
  worker: { id: string; name: string; photo_url: string | null; standard_shift_hours: number };
  /** The owner turned on the GPS check: send a location with every punch. */
  gps_required: boolean;
  clocked_in: boolean;
  clock_in_at: string | null;
  today_minutes: number;
  server_time: string;
  history: {
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    total_minutes: number | null;
    ot_minutes: number;
    status: AttendanceStatus;
  }[];
};

export type KioskWorkerList =
  | {
      ok: true;
      business_name: string;
      gps_required: boolean;
      workers: { id: string; name: string; photo_url: string | null; clocked_in: boolean }[];
    }
  | PunchError;

export type PunchResult =
  | {
      ok: true;
      action: "clock_in" | "clock_out";
      at: string;
      total_minutes?: number;
      status?: AttendanceStatus;
      summary: WorkerSummary;
    }
  | PunchError;

export type LoginResult = { ok: true; token: string; summary: WorkerSummary } | PunchError;
