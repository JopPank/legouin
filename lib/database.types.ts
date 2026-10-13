export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';

export type Database = {
  public: {
    Tables: {
      couples: {
        Row: { id: number; name: string };
        Insert: { id: number; name: string };
        Update: { id?: number; name?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; full_name: string; couple_id: number };
        Insert: { id: string; full_name: string; couple_id: number };
        Update: { id?: string; full_name?: string; couple_id?: number };
        Relationships: [];
      };
      meal_plan: {
        Row: {
          id: number;
          day_number: number;
          meal_type: MealType;
          assigned_couple_id: number | null;
          menu_details: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          day_number: number;
          meal_type: MealType;
          assigned_couple_id?: number | null;
          menu_details?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          day_number?: number;
          meal_type?: MealType;
          assigned_couple_id?: number | null;
          menu_details?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      gear_checklist: {
        Row: {
          id: number;
          item_name: string;
          category: string;
          is_communal: boolean;
          claimed_by_user: string | null;
          is_packed: boolean;
          assigned_couple_id: number | null;
        };
        Insert: {
          id?: number;
          item_name: string;
          category: string;
          is_communal?: boolean;
          claimed_by_user?: string | null;
          is_packed?: boolean;
          assigned_couple_id?: number | null;
        };
        Update: {
          id?: number;
          item_name?: string;
          category?: string;
          is_communal?: boolean;
          claimed_by_user?: string | null;
          is_packed?: boolean;
          assigned_couple_id?: number | null;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: number;
          description: string;
          amount: number;
          paid_by_user: string | null;
          paid_by_couple_id: number | null;
          split_type: 'equal';
          category: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          description: string;
          amount: number;
          paid_by_user?: string | null;
          paid_by_couple_id?: number | null;
          split_type?: 'equal';
          category?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          description?: string;
          amount?: number;
          paid_by_user?: string | null;
          paid_by_couple_id?: number | null;
          split_type?: 'equal';
          category?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      grocery_items: {
        Row: {
          id: number;
          item_name: string;
          quantity: string;
          assigned_couple_id: number | null;
          is_bought: boolean;
          created_by_user: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          item_name: string;
          quantity?: string;
          assigned_couple_id?: number | null;
          is_bought?: boolean;
          created_by_user?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          item_name?: string;
          quantity?: string;
          assigned_couple_id?: number | null;
          is_bought?: boolean;
          created_by_user?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      trip_logistics: {
        Row: {
          id: number;
          departure_details: string;
          return_details: string;
          meeting_place: string;
          transport_plan: string;
          rental_details: string;
          booking_notes: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          departure_details?: string;
          return_details?: string;
          meeting_place?: string;
          transport_plan?: string;
          rental_details?: string;
          booking_notes?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          departure_details?: string;
          return_details?: string;
          meeting_place?: string;
          transport_plan?: string;
          rental_details?: string;
          booking_notes?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fishing_notes: {
        Row: {
          id: number;
          target_species: string;
          license_reminders: string;
          bait_tackle_notes: string;
          local_notes: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          target_species?: string;
          license_reminders?: string;
          bait_tackle_notes?: string;
          local_notes?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          target_species?: string;
          license_reminders?: string;
          bait_tackle_notes?: string;
          local_notes?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      safety_info: {
        Row: {
          id: number;
          operator_contact: string;
          medical_services: string;
          emergency_contacts: string;
          boat_instructions: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          operator_contact?: string;
          medical_services?: string;
          emergency_contacts?: string;
          boat_instructions?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          operator_contact?: string;
          medical_services?: string;
          emergency_contacts?: string;
          boat_instructions?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_trip_participant: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
