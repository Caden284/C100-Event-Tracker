
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "absence_excuses": {
                  Row: {
                    "attendance_record_id": string,"note": string | null,"reason_key": string,"recorded_at": string,"recorded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_record_id": string,"note"?: string | null,"reason_key": string,"recorded_at"?: string,"recorded_by"?: string | null
                  }
                  Update: {
                    "attendance_record_id"?: string,"note"?: string | null,"reason_key"?: string,"recorded_at"?: string,"recorded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "absence_excuses_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: true
      referencedRelation: "attendance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "absence_excuses_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: true
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "absence_excuses_reason_key_fkey"
      columns: ["reason_key"]
isOneToOne: false
      referencedRelation: "absence_reasons"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "absence_excuses_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"absence_reasons": {
                  Row: {
                    "created_at": string,"description": string | null,"is_active": boolean,"key": string,"name": string,"requires_note": boolean,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"is_active"?: boolean,"key": string,"name": string,"requires_note"?: boolean,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"is_active"?: boolean,"key"?: string,"name"?: string,"requires_note"?: boolean,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_import_rows": {
                  Row: {
                    "attendance_record_id": string | null,"card_id": string | null,"email": string | null,"email_normalized": string | null,"event_date": string | null,"event_date_raw": string | null,"event_id": string | null,"fingerprint": string,"first_name": string | null,"group_key": string | null,"id": string,"import_id": string,"last_name": string | null,"marked_by": string | null,"marked_on": string | null,"match_method": string | null,"message": string | null,"outcome": string | null,"person_id": string | null,"person_type": string | null,"pin_event_name": string | null,"raw": NonNullable<Json>,"row_number": number,"status_key": string | null,"status_raw": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_record_id"?: string | null,"card_id"?: string | null,"email"?: string | null,"email_normalized"?: string | null,"event_date"?: string | null,"event_date_raw"?: string | null,"event_id"?: string | null,"fingerprint": string,"first_name"?: string | null,"group_key"?: string | null,"id"?: string,"import_id": string,"last_name"?: string | null,"marked_by"?: string | null,"marked_on"?: string | null,"match_method"?: string | null,"message"?: string | null,"outcome"?: string | null,"person_id"?: string | null,"person_type"?: string | null,"pin_event_name"?: string | null,"raw": NonNullable<Json>,"row_number": number,"status_key"?: string | null,"status_raw"?: string | null
                  }
                  Update: {
                    "attendance_record_id"?: string | null,"card_id"?: string | null,"email"?: string | null,"email_normalized"?: string | null,"event_date"?: string | null,"event_date_raw"?: string | null,"event_id"?: string | null,"fingerprint"?: string,"first_name"?: string | null,"group_key"?: string | null,"id"?: string,"import_id"?: string,"last_name"?: string | null,"marked_by"?: string | null,"marked_on"?: string | null,"match_method"?: string | null,"message"?: string | null,"outcome"?: string | null,"person_id"?: string | null,"person_type"?: string | null,"pin_event_name"?: string | null,"raw"?: NonNullable<Json>,"row_number"?: number,"status_key"?: string | null,"status_raw"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_import_rows_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_import_rows_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "attendance_imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_import_rows_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_import_rows_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "attendance_import_rows_record_fk"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "attendance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_import_rows_record_fk"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_import_rows_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "attendance_statuses"
      referencedColumns: ["key"]
    }
                  ]
                },"attendance_imports": {
                  Row: {
                    "column_mapping": NonNullable<Json>,"committed_at": string | null,"committed_by": string | null,"create_prospects_for_unmatched": boolean,"created_at": string,"created_by": string | null,"default_status_key": string | null,"event_resolution": NonNullable<Json>,"file_name": string,"file_sha256": string,"file_size": number,"file_type": string,"headers": (string)[],"id": string,"is_complete_roster": boolean,"notes": string | null,"reconcile_absent": boolean,"row_count": number,"row_decisions": NonNullable<Json>,"semester_id": string | null,"sheet_name": string | null,"status": string,"summary": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "column_mapping"?: NonNullable<Json>,"committed_at"?: string | null,"committed_by"?: string | null,"create_prospects_for_unmatched"?: boolean,"created_at"?: string,"created_by"?: string | null,"default_status_key"?: string | null,"event_resolution"?: NonNullable<Json>,"file_name": string,"file_sha256": string,"file_size": number,"file_type": string,"headers"?: (string)[],"id"?: string,"is_complete_roster"?: boolean,"notes"?: string | null,"reconcile_absent"?: boolean,"row_count"?: number,"row_decisions"?: NonNullable<Json>,"semester_id"?: string | null,"sheet_name"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "column_mapping"?: NonNullable<Json>,"committed_at"?: string | null,"committed_by"?: string | null,"create_prospects_for_unmatched"?: boolean,"created_at"?: string,"created_by"?: string | null,"default_status_key"?: string | null,"event_resolution"?: NonNullable<Json>,"file_name"?: string,"file_sha256"?: string,"file_size"?: number,"file_type"?: string,"headers"?: (string)[],"id"?: string,"is_complete_roster"?: boolean,"notes"?: string | null,"reconcile_absent"?: boolean,"row_count"?: number,"row_decisions"?: NonNullable<Json>,"semester_id"?: string | null,"sheet_name"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_imports_committed_by_fkey"
      columns: ["committed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_imports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_imports_default_status_key_fkey"
      columns: ["default_status_key"]
isOneToOne: false
      referencedRelation: "attendance_statuses"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "attendance_imports_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_records": {
                  Row: {
                    "change_reason": string | null,"created_at": string,"created_by": string | null,"event_id": string,"id": string,"import_id": string | null,"import_row_id": string | null,"migration_run_id": string | null,"person_id": string,"pin_event_name": string | null,"source": string,"source_card_id": string | null,"source_email": string | null,"source_first_name": string | null,"source_last_name": string | null,"source_marked_by": string | null,"source_marked_on": string | null,"status_key": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id": string,"id"?: string,"import_id"?: string | null,"import_row_id"?: string | null,"migration_run_id"?: string | null,"person_id": string,"pin_event_name"?: string | null,"source": string,"source_card_id"?: string | null,"source_email"?: string | null,"source_first_name"?: string | null,"source_last_name"?: string | null,"source_marked_by"?: string | null,"source_marked_on"?: string | null,"status_key": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id"?: string,"id"?: string,"import_id"?: string | null,"import_row_id"?: string | null,"migration_run_id"?: string | null,"person_id"?: string,"pin_event_name"?: string | null,"source"?: string,"source_card_id"?: string | null,"source_email"?: string | null,"source_first_name"?: string | null,"source_last_name"?: string | null,"source_marked_by"?: string | null,"source_marked_on"?: string | null,"status_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "attendance_imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_import_row_id_fkey"
      columns: ["import_row_id"]
isOneToOne: false
      referencedRelation: "attendance_import_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "attendance_records_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "attendance_statuses"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "attendance_records_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_statuses": {
                  Row: {
                    "counts_as_attended": boolean,"is_active": boolean,"key": string,"name": string,"pin_aliases": (string)[],"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "counts_as_attended"?: boolean,"is_active"?: boolean,"key": string,"name": string,"pin_aliases"?: (string)[],"sort_order"?: number
                  }
                  Update: {
                    "counts_as_attended"?: boolean,"is_active"?: boolean,"key"?: string,"name"?: string,"pin_aliases"?: (string)[],"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": Json | null,"id": number,"metadata": Json | null,"occurred_at": string,"reason": string | null,"record_id": string | null,"table_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: Json | null,"id"?: never,"metadata"?: Json | null,"occurred_at"?: string,"reason"?: string | null,"record_id"?: string | null,"table_name"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: Json | null,"id"?: never,"metadata"?: Json | null,"occurred_at"?: string,"reason"?: string | null,"record_id"?: string | null,"table_name"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"disciplinary_actions": {
                  Row: {
                    "action_type": string,"appeal_outcome": string | null,"approved_at": string | null,"approved_by": string | null,"created_at": string,"effective_date": string | null,"id": string,"initiated_by": string | null,"is_override": boolean,"member_id": string,"override_reason": string | null,"policy_id": string | null,"reason": string,"resolution": string | null,"review_date": string | null,"semester_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_type": string,"appeal_outcome"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"effective_date"?: string | null,"id"?: string,"initiated_by"?: string | null,"is_override"?: boolean,"member_id": string,"override_reason"?: string | null,"policy_id"?: string | null,"reason": string,"resolution"?: string | null,"review_date"?: string | null,"semester_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "action_type"?: string,"appeal_outcome"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"effective_date"?: string | null,"id"?: string,"initiated_by"?: string | null,"is_override"?: boolean,"member_id"?: string,"override_reason"?: string | null,"policy_id"?: string | null,"reason"?: string,"resolution"?: string | null,"review_date"?: string | null,"semester_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "disciplinary_actions_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disciplinary_actions_initiated_by_fkey"
      columns: ["initiated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disciplinary_actions_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disciplinary_actions_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "disciplinary_actions_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "disciplinary_actions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "membership_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disciplinary_actions_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"event_categories": {
                  Row: {
                    "color": string,"created_at": string,"description": string | null,"is_active": boolean,"is_legacy": boolean,"is_recruitment": boolean,"key": string,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"description"?: string | null,"is_active"?: boolean,"is_legacy"?: boolean,"is_recruitment"?: boolean,"key": string,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"description"?: string | null,"is_active"?: boolean,"is_legacy"?: boolean,"is_recruitment"?: boolean,"key"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"event_pin_names": {
                  Row: {
                    "created_at": string,"created_by": string | null,"event_id": string,"id": string,"is_primary": boolean,"pin_name": string,"pin_name_normalized": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"event_id": string,"id"?: string,"is_primary"?: boolean,"pin_name": string,"pin_name_normalized"?: never
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"event_id"?: string,"id"?: string,"is_primary"?: boolean,"pin_name"?: string,"pin_name_normalized"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_pin_names_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_pin_names_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "archived_at": string | null,"attendance_source": string,"category_key": string | null,"change_reason": string | null,"counting_override": string | null,"counting_override_approved_at": string | null,"counting_override_approved_by": string | null,"counting_override_reason": string | null,"created_at": string,"created_by": string | null,"description": string | null,"end_time": string | null,"event_date": string | null,"id": string,"legacy_key": string | null,"location": string | null,"migration_run_id": string | null,"name": string,"notes": string | null,"planning_status": string,"semester_id": string | null,"series_key": string | null,"start_time": string | null,"time_note": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"attendance_source"?: string,"category_key"?: string | null,"change_reason"?: string | null,"counting_override"?: string | null,"counting_override_approved_at"?: string | null,"counting_override_approved_by"?: string | null,"counting_override_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_time"?: string | null,"event_date"?: string | null,"id"?: string,"legacy_key"?: string | null,"location"?: string | null,"migration_run_id"?: string | null,"name": string,"notes"?: string | null,"planning_status"?: string,"semester_id"?: string | null,"series_key"?: string | null,"start_time"?: string | null,"time_note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"attendance_source"?: string,"category_key"?: string | null,"change_reason"?: string | null,"counting_override"?: string | null,"counting_override_approved_at"?: string | null,"counting_override_approved_by"?: string | null,"counting_override_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_time"?: string | null,"event_date"?: string | null,"id"?: string,"legacy_key"?: string | null,"location"?: string | null,"migration_run_id"?: string | null,"name"?: string,"notes"?: string | null,"planning_status"?: string,"semester_id"?: string | null,"series_key"?: string | null,"start_time"?: string | null,"time_note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "event_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "events_counting_override_approved_by_fkey"
      columns: ["counting_override_approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_dues": {
                  Row: {
                    "amount_cents": number | null,"created_at": string,"id": string,"member_id": string,"note": string | null,"paid_on": string | null,"recorded_by": string | null,"semester_id": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number | null,"created_at"?: string,"id"?: string,"member_id": string,"note"?: string | null,"paid_on"?: string | null,"recorded_by"?: string | null,"semester_id": string,"status": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number | null,"created_at"?: string,"id"?: string,"member_id"?: string,"note"?: string | null,"paid_on"?: string | null,"recorded_by"?: string | null,"semester_id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_dues_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_dues_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "member_dues_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "member_dues_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_dues_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_dues_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_notes": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"id": string,"member_id": string,"migration_run_id": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id": string,"migration_run_id"?: string | null,"source"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id"?: string,"migration_run_id"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_notes_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_notes_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "member_notes_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    }
                  ]
                },"member_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_status": string | null,"id": string,"member_id": string,"reason": string | null,"to_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: string | null,"id"?: string,"member_id": string,"reason"?: string | null,"to_status": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: string | null,"id"?: string,"member_id"?: string,"reason"?: string | null,"to_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_status_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_status_history_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_status_history_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "member_status_history_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    }
                  ]
                },"member_statuses": {
                  Row: {
                    "counts_as_active": boolean,"description": string | null,"is_active": boolean,"is_tracked": boolean,"key": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "counts_as_active"?: boolean,"description"?: string | null,"is_active"?: boolean,"is_tracked"?: boolean,"key": string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "counts_as_active"?: boolean,"description"?: string | null,"is_active"?: boolean,"is_tracked"?: boolean,"key"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"members": {
                  Row: {
                    "change_reason": string | null,"committee": string | null,"converted_from_prospect_id": string | null,"created_at": string,"created_by": string | null,"eboard_role": string | null,"id": string,"joined_semester_id": string | null,"legacy_key": string | null,"legacy_strikes": number | null,"member_since": string | null,"migration_run_id": string | null,"person_id": string,"status_changed_at": string | null,"status_key": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "change_reason"?: string | null,"committee"?: string | null,"converted_from_prospect_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"eboard_role"?: string | null,"id"?: string,"joined_semester_id"?: string | null,"legacy_key"?: string | null,"legacy_strikes"?: number | null,"member_since"?: string | null,"migration_run_id"?: string | null,"person_id": string,"status_changed_at"?: string | null,"status_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "change_reason"?: string | null,"committee"?: string | null,"converted_from_prospect_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"eboard_role"?: string | null,"id"?: string,"joined_semester_id"?: string | null,"legacy_key"?: string | null,"legacy_strikes"?: number | null,"member_since"?: string | null,"migration_run_id"?: string | null,"person_id"?: string,"status_changed_at"?: string | null,"status_key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_converted_from_fk"
      columns: ["converted_from_prospect_id"]
isOneToOne: false
      referencedRelation: "prospective_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_converted_from_fk"
      columns: ["converted_from_prospect_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["prospect_id"]
    },{
      foreignKeyName: "members_converted_from_fk"
      columns: ["converted_from_prospect_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["prospect_id"]
    },{
      foreignKeyName: "members_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_joined_semester_id_fkey"
      columns: ["joined_semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "members_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "member_statuses"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "members_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_policies": {
                  Row: {
                    "approval_note": string | null,"approval_requested_at": string | null,"approval_requested_by": string | null,"approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string | null,"effective_from": string | null,"effective_semester_id": string | null,"effective_to": string | null,"id": string,"migration_run_id": string | null,"name": string,"retired_at": string | null,"retired_by": string | null,"rules": NonNullable<Json>,"source": string,"status": string,"summary": string | null,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_note"?: string | null,"approval_requested_at"?: string | null,"approval_requested_by"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string | null,"effective_semester_id"?: string | null,"effective_to"?: string | null,"id"?: string,"migration_run_id"?: string | null,"name": string,"retired_at"?: string | null,"retired_by"?: string | null,"rules": NonNullable<Json>,"source"?: string,"status"?: string,"summary"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "approval_note"?: string | null,"approval_requested_at"?: string | null,"approval_requested_by"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string | null,"effective_semester_id"?: string | null,"effective_to"?: string | null,"id"?: string,"migration_run_id"?: string | null,"name"?: string,"retired_at"?: string | null,"retired_by"?: string | null,"rules"?: NonNullable<Json>,"source"?: string,"status"?: string,"summary"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_policies_approval_requested_by_fkey"
      columns: ["approval_requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_policies_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_policies_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_policies_effective_semester_id_fkey"
      columns: ["effective_semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_policies_retired_by_fkey"
      columns: ["retired_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_policies_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"migration_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string,"file_sha256": string,"id": string,"rolled_back_at": string | null,"rolled_back_by": string | null,"status": string,"summary": NonNullable<Json>,"warnings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name": string,"file_sha256": string,"id"?: string,"rolled_back_at"?: string | null,"rolled_back_by"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string,"file_sha256"?: string,"id"?: string,"rolled_back_at"?: string | null,"rolled_back_by"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "migration_runs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "migration_runs_rolled_back_by_fkey"
      columns: ["rolled_back_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "enabled": boolean,"role_key": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"role_key": string,"type": string
                  }
                  Update: {
                    "enabled"?: boolean,"role_key"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"group_key": string | null,"id": string,"link": string | null,"occurrences": number,"read_at": string | null,"recipient_id": string,"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"group_key"?: string | null,"id"?: string,"link"?: string | null,"occurrences"?: number,"read_at"?: string | null,"recipient_id": string,"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"group_key"?: string | null,"id"?: string,"link"?: string | null,"occurrences"?: number,"read_at"?: string | null,"recipient_id"?: string,"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "change_reason": string | null,"created_at": string,"created_by": string | null,"first_name": string | null,"id": string,"last_name": string | null,"legacy_key": string | null,"migration_run_id": string | null,"preferred_name": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"preferred_name"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"preferred_name"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"description": string,"key": string
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"person_identifiers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_primary": boolean,"kind": string,"migration_run_id": string | null,"person_id": string,"retired_at": string | null,"source": string,"value": string,"value_normalized": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_primary"?: boolean,"kind": string,"migration_run_id"?: string | null,"person_id": string,"retired_at"?: string | null,"source"?: string,"value": string,"value_normalized"?: never
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_primary"?: boolean,"kind"?: string,"migration_run_id"?: string | null,"person_id"?: string,"retired_at"?: string | null,"source"?: string,"value"?: string,"value_normalized"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_identifiers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "person_identifiers_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "person_identifiers_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    }
                  ]
                },"point_rules": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"audience": string,"category_key": string | null,"created_at": string,"created_by": string | null,"id": string,"max_awards_per_semester": number | null,"name": string,"notes": string | null,"points": number,"semester_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audience"?: string,"category_key"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"max_awards_per_semester"?: number | null,"name": string,"notes"?: string | null,"points": number,"semester_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audience"?: string,"category_key"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"max_awards_per_semester"?: number | null,"name"?: string,"notes"?: string | null,"points"?: number,"semester_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "point_rules_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_rules_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "event_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "point_rules_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_rules_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"point_transactions": {
                  Row: {
                    "attendance_record_id": string | null,"awarded_by": string | null,"created_at": string,"event_id": string | null,"id": string,"person_id": string,"points": number,"policy_version": string | null,"reason": string,"rule_id": string | null,"semester_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_record_id"?: string | null,"awarded_by"?: string | null,"created_at"?: string,"event_id"?: string | null,"id"?: string,"person_id": string,"points": number,"policy_version"?: string | null,"reason": string,"rule_id"?: string | null,"semester_id": string
                  }
                  Update: {
                    "attendance_record_id"?: string | null,"awarded_by"?: string | null,"created_at"?: string,"event_id"?: string | null,"id"?: string,"person_id"?: string,"points"?: number,"policy_version"?: string | null,"reason"?: string,"rule_id"?: string | null,"semester_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "point_transactions_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "attendance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_awarded_by_fkey"
      columns: ["awarded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "point_transactions_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "point_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_transactions_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"policy_approvals": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"id": string,"note": string | null,"policy_id": string,"semester_id": string | null,"snapshot": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"policy_id": string,"semester_id"?: string | null,"snapshot"?: Json | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"policy_id"?: string,"semester_id"?: string | null,"snapshot"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_approvals_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_approvals_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "membership_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_approvals_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"is_active": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"prospective_members": {
                  Row: {
                    "assigned_officer_id": string | null,"change_reason": string | null,"converted_at": string | null,"converted_by": string | null,"converted_member_id": string | null,"created_at": string,"created_by": string | null,"first_seen_event_id": string | null,"first_seen_text": string | null,"follow_up_status": string,"id": string,"interest_override": string | null,"legacy_converted_flag": string | null,"legacy_key": string | null,"migration_run_id": string | null,"next_steps": string | null,"notes": string | null,"person_id": string,"semester_id": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_officer_id"?: string | null,"change_reason"?: string | null,"converted_at"?: string | null,"converted_by"?: string | null,"converted_member_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"first_seen_event_id"?: string | null,"first_seen_text"?: string | null,"follow_up_status"?: string,"id"?: string,"interest_override"?: string | null,"legacy_converted_flag"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"next_steps"?: string | null,"notes"?: string | null,"person_id": string,"semester_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "assigned_officer_id"?: string | null,"change_reason"?: string | null,"converted_at"?: string | null,"converted_by"?: string | null,"converted_member_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"first_seen_event_id"?: string | null,"first_seen_text"?: string | null,"follow_up_status"?: string,"id"?: string,"interest_override"?: string | null,"legacy_converted_flag"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"next_steps"?: string | null,"notes"?: string | null,"person_id"?: string,"semester_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prospective_members_assigned_officer_id_fkey"
      columns: ["assigned_officer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_converted_by_fkey"
      columns: ["converted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_converted_member_id_fkey"
      columns: ["converted_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_converted_member_id_fkey"
      columns: ["converted_member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "prospective_members_converted_member_id_fkey"
      columns: ["converted_member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "prospective_members_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_first_seen_event_id_fkey"
      columns: ["first_seen_event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: true
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "prospective_members_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prospective_members_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recognition_categories": {
                  Row: {
                    "audience": string,"created_at": string,"created_by": string | null,"description": string | null,"eligibility_rules": NonNullable<Json>,"id": string,"is_active": boolean,"key": string,"name": string,"updated_at": string,"uses_auto_eligibility": boolean,"uses_nominations": boolean,"uses_officer_decision": boolean,"uses_voting": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"eligibility_rules"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"key": string,"name": string,"updated_at"?: string,"uses_auto_eligibility"?: boolean,"uses_nominations"?: boolean,"uses_officer_decision"?: boolean,"uses_voting"?: boolean
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"eligibility_rules"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"key"?: string,"name"?: string,"updated_at"?: string,"uses_auto_eligibility"?: boolean,"uses_nominations"?: boolean,"uses_officer_decision"?: boolean,"uses_voting"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "recognition_categories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recognition_nominations": {
                  Row: {
                    "created_at": string,"id": string,"justification": string | null,"nominated_by": string,"nominee_person_id": string,"period_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"justification"?: string | null,"nominated_by"?: string,"nominee_person_id": string,"period_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"justification"?: string | null,"nominated_by"?: string,"nominee_person_id"?: string,"period_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recognition_nominations_nominated_by_fkey"
      columns: ["nominated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_nominations_nominee_person_id_fkey"
      columns: ["nominee_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_nominations_nominee_person_id_fkey"
      columns: ["nominee_person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "recognition_nominations_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "recognition_periods"
      referencedColumns: ["id"]
    }
                  ]
                },"recognition_periods": {
                  Row: {
                    "anonymous_voting": boolean,"category_id": string,"created_at": string,"created_by": string | null,"finalized_at": string | null,"finalized_by": string | null,"id": string,"max_votes_per_voter": number,"name": string,"nomination_closes_at": string | null,"results_visibility": string,"semester_id": string,"status": string,"updated_at": string,"voting_closes_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymous_voting"?: boolean,"category_id": string,"created_at"?: string,"created_by"?: string | null,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"max_votes_per_voter"?: number,"name": string,"nomination_closes_at"?: string | null,"results_visibility"?: string,"semester_id": string,"status"?: string,"updated_at"?: string,"voting_closes_at"?: string | null
                  }
                  Update: {
                    "anonymous_voting"?: boolean,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"max_votes_per_voter"?: number,"name"?: string,"nomination_closes_at"?: string | null,"results_visibility"?: string,"semester_id"?: string,"status"?: string,"updated_at"?: string,"voting_closes_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recognition_periods_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "recognition_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_periods_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_periods_finalized_by_fkey"
      columns: ["finalized_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_periods_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"recognition_results": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string | null,"id": string,"is_official": boolean,"note": string | null,"outcome": string,"period_id": string,"person_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_official"?: boolean,"note"?: string | null,"outcome"?: string,"period_id": string,"person_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_official"?: boolean,"note"?: string | null,"outcome"?: string,"period_id"?: string,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recognition_results_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_results_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_results_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "recognition_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_results_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_results_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    }
                  ]
                },"recognition_votes": {
                  Row: {
                    "created_at": string,"id": string,"nominee_person_id": string,"period_id": string,"voter_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"nominee_person_id": string,"period_id": string,"voter_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nominee_person_id"?: string,"period_id"?: string,"voter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recognition_votes_nominee_person_id_fkey"
      columns: ["nominee_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_votes_nominee_person_id_fkey"
      columns: ["nominee_person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "recognition_votes_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "recognition_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recognition_votes_voter_id_fkey"
      columns: ["voter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_key": string
                  }
                  Update: {
                    "permission_key"?: string,"role_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string | null,"is_system": boolean,"key": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"is_system"?: boolean,"key": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"is_system"?: boolean,"key"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"semesters": {
                  Row: {
                    "academic_year": string,"archived_at": string | null,"created_at": string,"created_by": string | null,"dues_deadline": string | null,"end_date": string,"id": string,"name": string,"notes": string | null,"policy_id": string | null,"start_date": string,"status": string,"term": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year": string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dues_deadline"?: string | null,"end_date": string,"id"?: string,"name": string,"notes"?: string | null,"policy_id"?: string | null,"start_date": string,"status"?: string,"term": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "academic_year"?: string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dues_deadline"?: string | null,"end_date"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"policy_id"?: string | null,"start_date"?: string,"status"?: string,"term"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "semesters_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "semesters_policy_fk"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "membership_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "semesters_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"strike_dismissals": {
                  Row: {
                    "created_at": string,"dismissed_by": string | null,"id": string,"member_id": string,"reason": string,"semester_id": string,"trigger_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dismissed_by"?: string | null,"id"?: string,"member_id": string,"reason": string,"semester_id": string,"trigger_key": string
                  }
                  Update: {
                    "created_at"?: string,"dismissed_by"?: string | null,"id"?: string,"member_id"?: string,"reason"?: string,"semester_id"?: string,"trigger_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "strike_dismissals_dismissed_by_fkey"
      columns: ["dismissed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_dismissals_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_dismissals_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "strike_dismissals_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "strike_dismissals_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"strike_records": {
                  Row: {
                    "created_at": string,"event_id": string | null,"id": string,"member_id": string,"points": number,"policy_id": string | null,"reason": string,"recorded_by": string | null,"semester_id": string | null,"source": string,"trigger_key": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id"?: string | null,"id"?: string,"member_id": string,"points"?: number,"policy_id"?: string | null,"reason": string,"recorded_by"?: string | null,"semester_id"?: string | null,"source"?: string,"trigger_key"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string | null,"id"?: string,"member_id"?: string,"points"?: number,"policy_id"?: string | null,"reason"?: string,"recorded_by"?: string | null,"semester_id"?: string | null,"source"?: string,"trigger_key"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "strike_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_records_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_records_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "strike_records_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "strike_records_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "membership_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_records_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_records_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strike_records_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"unmatched_scans": {
                  Row: {
                    "assigned_to": string | null,"attendance_record_id": string | null,"card_id": string | null,"created_at": string,"details": string | null,"email": string | null,"event_date": string | null,"event_id": string | null,"first_name": string | null,"id": string,"import_id": string | null,"import_row_id": string | null,"last_name": string | null,"legacy_key": string | null,"migration_run_id": string | null,"pin_event_name": string | null,"reason": string,"resolution_note": string | null,"resolution_status": string,"resolved_at": string | null,"resolved_by": string | null,"resolved_person_id": string | null,"source": string,"status_key": string | null,"suggestions": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"attendance_record_id"?: string | null,"card_id"?: string | null,"created_at"?: string,"details"?: string | null,"email"?: string | null,"event_date"?: string | null,"event_id"?: string | null,"first_name"?: string | null,"id"?: string,"import_id"?: string | null,"import_row_id"?: string | null,"last_name"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"pin_event_name"?: string | null,"reason": string,"resolution_note"?: string | null,"resolution_status"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_person_id"?: string | null,"source"?: string,"status_key"?: string | null,"suggestions"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"attendance_record_id"?: string | null,"card_id"?: string | null,"created_at"?: string,"details"?: string | null,"email"?: string | null,"event_date"?: string | null,"event_id"?: string | null,"first_name"?: string | null,"id"?: string,"import_id"?: string | null,"import_row_id"?: string | null,"last_name"?: string | null,"legacy_key"?: string | null,"migration_run_id"?: string | null,"pin_event_name"?: string | null,"reason"?: string,"resolution_note"?: string | null,"resolution_status"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"resolved_person_id"?: string | null,"source"?: string,"status_key"?: string | null,"suggestions"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unmatched_scans_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "attendance_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_attendance_record_id_fkey"
      columns: ["attendance_record_id"]
isOneToOne: false
      referencedRelation: "v_attendance_detail"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "attendance_imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_import_row_id_fkey"
      columns: ["import_row_id"]
isOneToOne: false
      referencedRelation: "attendance_import_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_resolved_person_id_fkey"
      columns: ["resolved_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unmatched_scans_resolved_person_id_fkey"
      columns: ["resolved_person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "unmatched_scans_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "attendance_statuses"
      referencedColumns: ["key"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role_key": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role_key": string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role_key"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_attendance_detail": {
                  Row: {
                    "category_key": string | null,"counts_as_attended": boolean | null,"created_at": string | null,"effective_category": string | null,"event_date": string | null,"event_id": string | null,"event_name": string | null,"first_name": string | null,"id": string | null,"last_name": string | null,"member_id": string | null,"member_since": string | null,"person_id": string | null,"prospect_id": string | null,"semester_id": string | null,"source": string | null,"status_key": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "v_people_directory"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "attendance_records_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "attendance_statuses"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "events_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "event_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "events_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    }
                  ]
                },"v_people_directory": {
                  Row: {
                    "committee": string | null,"display_name": string | null,"eboard_role": string | null,"email": string | null,"first_name": string | null,"last_name": string | null,"member_id": string | null,"member_since": string | null,"person_id": string | null,"preferred_name": string | null,"prospect_id": string | null,"prospect_status": string | null,"status_key": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "members_status_key_fkey"
      columns: ["status_key"]
isOneToOne: false
      referencedRelation: "member_statuses"
      referencedColumns: ["key"]
    }
                  ]
                }
          }
          Functions: {
            "assign_policy_to_semester":
{ Args: { "p_policy": string,"p_reason"?: string,"p_semester": string }; Returns: undefined
                           },
"award_points_for_semester":
{ Args: { "p_semester": string }; Returns: number
                           },
"classify_attendance_import":
{ Args: { "p_import": string }; Returns: Json
                           },
"commit_attendance_import":
{ Args: { "p_import": string }; Returns: Json
                           },
"commit_workbook_migration":
{ Args: { "p": Json }; Returns: Json
                           },
"convert_prospect_to_member":
{ Args: { "p_member_since": string,"p_prospect": string,"p_reason"?: string,"p_semester": string,"p_status"?: string }; Returns: string
                           },
"delete_attendance_record":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"has_permission":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"is_officer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_privileged":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_reliable_card_id":
{ Args: { "t": string }; Returns: boolean
                           },
"is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_email":
{ Args: { "t": string }; Returns: boolean
                           },
"log_audit":
{ Args: { "p_action": string,"p_metadata"?: Json,"p_reason"?: string,"p_record_id"?: string,"p_table"?: string }; Returns: undefined
                           },
"member_dues_ok":
{ Args: { "p_semester": string }; Returns: {
              "dues_ok": boolean,"dues_recorded": boolean,"member_id": string
            }[]
                           },
"my_permissions":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"norm_email":
{ Args: { "t": string }; Returns: string
                           },
"norm_text":
{ Args: { "t": string }; Returns: string
                           },
"notify_permission":
{ Args: { "p_body"?: string,"p_group_key"?: string,"p_link"?: string,"p_permission": string,"p_title": string,"p_type": string }; Returns: undefined
                           },
"open_review_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"perm":
{ Args: { "p": string }; Returns: boolean
                           },
"person_name":
{ Args: { "p_first": string,"p_last": string,"p_preferred"?: string }; Returns: string
                           },
"person_type_of":
{ Args: { "p_person": string }; Returns: string
                           },
"primary_email":
{ Args: { "p_person": string }; Returns: string
                           },
"recognition_vote_tally":
{ Args: { "p_period": string }; Returns: {
              "nominee_person_id": string,"votes": number
            }[]
                           },
"record_absence":
{ Args: { "p_event": string,"p_excused": boolean,"p_note"?: string,"p_person": string,"p_reason"?: string }; Returns: string
                           },
"require_permission":
{ Args: { "p": string }; Returns: undefined
                           },
"resolve_unmatched_scan":
{ Args: { "p_action": string,"p_add_email"?: boolean,"p_event"?: string,"p_new"?: Json,"p_note"?: string,"p_person"?: string,"p_scan": string }; Returns: Json
                           },
"rollback_workbook_migration":
{ Args: { "p_reason": string,"p_run": string }; Returns: Json
                           },
"rollover_semester":
{ Args: { "p_from": string,"p_reason"?: string,"p_to": string }; Returns: Json
                           },
"set_manual_attendance":
{ Args: { "p_event": string,"p_person": string,"p_reason"?: string,"p_status": string }; Returns: string
                           },
"set_primary_email":
{ Args: { "p_email": string,"p_person": string,"p_reason"?: string }; Returns: undefined
                           },
"suggest_people":
{ Args: { "p_first": string,"p_last": string,"p_limit"?: number }; Returns: Json
                           },
"wb_find_event":
{ Args: { "p_date": string,"p_pin": string,"p_semester": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
