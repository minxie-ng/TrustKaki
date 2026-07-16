import type { AgentId, RiskLevel } from "@/lib/types";
import type {
  ConsentEventType,
  ContactChannel,
  ContactKind,
  ContactVerificationStatus,
  NotificationCategory,
} from "@/lib/contacts/contracts";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SignalType = "health" | "daily_living" | "digital_safety" | "social";
export type SignalSeverity = "low" | "medium" | "high";
export type MessageSender = "senior" | "trustkaki" | "system";
export type CheckInStatus = "pending" | "active" | "completed";
export type RiskChange = "none" | "increase" | "decrease";
export type BriefTrigger = "policy" | "manual_override";
export type WhatsAppWebhookEventType =
  | "inbound_text"
  | "status_sent"
  | "status_delivered"
  | "status_read"
  | "status_failed"
  | "unsupported";
export type WhatsAppWebhookEventStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "ignored";
export type WhatsAppOutboundStatus = "not_started" | "pending" | "sent" | "failed";
export type SeniorMessagingPlatform = "whatsapp" | "telegram";
export type TelegramWebhookEventType = "inbound_text" | "unsupported";
export type TelegramWebhookEventStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "ignored";
export type TelegramOutboundStatus =
  | "not_started"
  | "pending"
  | "accepted"
  | "failed";
export type PatternType =
  | "mobility_and_frailty"
  | "social_withdrawal"
  | "combined_wellbeing_decline";
export type PatternStatus = "emerging" | "active" | "resolved";
export type QueueStatus =
  | "pending"
  | "acknowledged"
  | "followed_up"
  | "snoozed"
  | "escalated"
  | "resolved";
export type CaregiverActionType =
  | "mark_for_follow_up"
  | "assign"
  | "record_outcome"
  | "snooze"
  | "escalate"
  | "resolve";
export type EscalationDestination =
  | "family_guardian"
  | "aac_supervisor"
  | "healthcare_follow_up"
  | "emergency_guidance";
export type ContactOutcome =
  | "reached_and_okay"
  | "needs_follow_up"
  | "referred_to_aac_staff"
  | "unable_to_reach"
  | "resolved";
export type ContextStore = "memory" | "health_context" | "routine_baseline";
export type ContextExtractionMethod =
  | "caregiver_confirmed"
  | "ai_extracted"
  | "imported"
  | "admin_corrected";
export type ContextApplicationTag =
  | "conversation_personalisation"
  | "pattern_watch"
  | "proactive_check_in"
  | "communication_style"
  | "accessibility_support"
  | "caregiver_routing";
export type ContextEventType =
  | "proposal_accepted"
  | "proposal_rejected"
  | "confirmed"
  | "corrected"
  | "superseded"
  | "archived"
  | "expired";
export type ProactiveCheckInStatus =
  | "pending_initial_send"
  | "awaiting_initial_response"
  | "pending_retry_send"
  | "awaiting_retry_response"
  | "responded"
  | "escalated"
  | "cancelled"
  | "failed";
export type ProactiveCheckInStage =
  | "initial_send"
  | "initial_deadline"
  | "retry_send"
  | "final_deadline";

export interface Database {
  public: {
    Tables: {
      seniors: {
        Row: {
          id: string;
          external_ref: string | null;
          display_name: string;
          age: number | null;
          gender: string | null;
          address_text: string | null;
          living_situation: string | null;
          phone_e164: string | null;
          risk_level: RiskLevel;
          last_check_in_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          external_ref?: string | null;
          display_name: string;
          age?: number | null;
          gender?: string | null;
          address_text?: string | null;
          living_situation?: string | null;
          phone_e164?: string | null;
          risk_level?: RiskLevel;
          last_check_in_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["seniors"]["Insert"]>;
      };
      caregivers: {
        Row: {
          id: string;
          external_ref: string | null;
          display_name: string;
          relationship: string | null;
          phone: string | null;
          auth_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          external_ref?: string | null;
          display_name: string;
          relationship?: string | null;
          phone?: string | null;
          auth_user_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["caregivers"]["Insert"]>;
      };
      senior_caregivers: {
        Row: {
          senior_id: string;
          caregiver_id: string;
          role: "caregiver" | "aac_volunteer";
          relationship: string | null;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          senior_id: string;
          caregiver_id: string;
          role: "caregiver" | "aac_volunteer";
          relationship?: string | null;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["senior_caregivers"]["Insert"]>;
      };
      senior_messaging_identities: {
        Row: {
          id: string;
          senior_id: string;
          platform: SeniorMessagingPlatform;
          external_user_id: string;
          external_chat_id: string | null;
          verified_at: string | null;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          platform: SeniorMessagingPlatform;
          external_user_id: string;
          external_chat_id?: string | null;
          verified_at?: string | null;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["senior_messaging_identities"]["Insert"]
        >;
      };
      routine_baselines: {
        Row: {
          id: string;
          senior_id: string;
          baseline_type:
            | "response_cadence"
            | "meal"
            | "mobility"
            | "aac_participation"
            | "social_comfort"
            | "medication"
            | "other";
          label: string;
          usual_pattern: string;
          schedule_json: Json;
          source: string;
          source_message_id: string | null;
          confidence: number;
          status: "active" | "superseded" | "archived";
          safe_use_notes: string | null;
          context_key: string;
          extraction_method: ContextExtractionMethod;
          last_confirmed_at: string;
          expires_at: string | null;
          superseded_by_id: string | null;
          application_tags: ContextApplicationTag[];
          created_by_caregiver_id: string | null;
          created_by_system: string | null;
          updated_by_caregiver_id: string | null;
          updated_by_system: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          baseline_type:
            | "response_cadence"
            | "meal"
            | "mobility"
            | "aac_participation"
            | "social_comfort"
            | "medication"
            | "other";
          label: string;
          usual_pattern: string;
          schedule_json?: Json;
          source?: string;
          source_message_id?: string | null;
          confidence?: number;
          status?: "active" | "superseded" | "archived";
          safe_use_notes?: string | null;
          context_key: string;
          extraction_method?: ContextExtractionMethod;
          last_confirmed_at?: string;
          expires_at?: string | null;
          superseded_by_id?: string | null;
          application_tags?: ContextApplicationTag[];
          created_by_caregiver_id?: string | null;
          created_by_system?: string | null;
          updated_by_caregiver_id?: string | null;
          updated_by_system?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["routine_baselines"]["Insert"]>;
      };
      senior_health_contexts: {
        Row: {
          id: string;
          senior_id: string;
          context_type:
            | "mobility"
            | "appetite"
            | "medication"
            | "sensory"
            | "cognitive"
            | "social"
            | "other";
          description: string;
          source: string;
          source_message_id: string | null;
          confidence: number;
          first_observed_at: string | null;
          last_observed_at: string | null;
          status: "active" | "resolved" | "superseded" | "archived";
          safe_use_notes: string;
          context_key: string;
          extraction_method: ContextExtractionMethod;
          last_confirmed_at: string;
          expires_at: string | null;
          superseded_by_id: string | null;
          application_tags: ContextApplicationTag[];
          created_by_caregiver_id: string | null;
          created_by_system: string | null;
          updated_by_caregiver_id: string | null;
          updated_by_system: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          context_type:
            | "mobility"
            | "appetite"
            | "medication"
            | "sensory"
            | "cognitive"
            | "social"
            | "other";
          description: string;
          source?: string;
          source_message_id?: string | null;
          confidence?: number;
          first_observed_at?: string | null;
          last_observed_at?: string | null;
          status?: "active" | "resolved" | "superseded" | "archived";
          safe_use_notes?: string;
          context_key: string;
          extraction_method?: ContextExtractionMethod;
          last_confirmed_at?: string;
          expires_at?: string | null;
          superseded_by_id?: string | null;
          application_tags?: ContextApplicationTag[];
          created_by_caregiver_id?: string | null;
          created_by_system?: string | null;
          updated_by_caregiver_id?: string | null;
          updated_by_system?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["senior_health_contexts"]["Insert"]>;
      };
      senior_memories: {
        Row: {
          id: string;
          senior_id: string;
          memory_type:
            | "communication_preference"
            | "family_context"
            | "food_preference"
            | "routine_preference"
            | "aac_preference"
            | "other";
          content: string;
          source: string;
          source_message_id: string | null;
          confidence: number;
          importance: number;
          status: "active" | "superseded" | "archived";
          remembered_at: string;
          follow_up_after: string | null;
          expires_at: string | null;
          safe_use_notes: string | null;
          context_key: string;
          extraction_method: ContextExtractionMethod;
          last_confirmed_at: string;
          superseded_by_id: string | null;
          application_tags: ContextApplicationTag[];
          created_by_caregiver_id: string | null;
          created_by_system: string | null;
          updated_by_caregiver_id: string | null;
          updated_by_system: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          memory_type:
            | "communication_preference"
            | "family_context"
            | "food_preference"
            | "routine_preference"
            | "aac_preference"
            | "other";
          content: string;
          source?: string;
          source_message_id?: string | null;
          confidence?: number;
          importance?: number;
          status?: "active" | "superseded" | "archived";
          remembered_at?: string;
          follow_up_after?: string | null;
          expires_at?: string | null;
          safe_use_notes?: string | null;
          context_key: string;
          extraction_method?: ContextExtractionMethod;
          last_confirmed_at?: string;
          superseded_by_id?: string | null;
          application_tags?: ContextApplicationTag[];
          created_by_caregiver_id?: string | null;
          created_by_system?: string | null;
          updated_by_caregiver_id?: string | null;
          updated_by_system?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["senior_memories"]["Insert"]>;
      };
      senior_context_events: {
        Row: {
          id: string;
          senior_id: string;
          store: ContextStore;
          context_id: string | null;
          context_key: string;
          event_type: ContextEventType;
          rejection_reason:
            | "low_confidence"
            | "unsupported_evidence"
            | "sensitive_data"
            | "diagnostic_inference"
            | "unsupported_category"
            | "invalid_candidate"
            | null;
          reason: string | null;
          source_message_id: string | null;
          before_snapshot: Json | null;
          after_snapshot: Json | null;
          actor_caregiver_id: string | null;
          actor_system: string | null;
          command_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          store: ContextStore;
          context_id?: string | null;
          context_key: string;
          event_type: ContextEventType;
          rejection_reason?:
            | "low_confidence"
            | "unsupported_evidence"
            | "sensitive_data"
            | "diagnostic_inference"
            | "unsupported_category"
            | "invalid_candidate"
            | null;
          reason?: string | null;
          source_message_id?: string | null;
          before_snapshot?: Json | null;
          after_snapshot?: Json | null;
          actor_caregiver_id?: string | null;
          actor_system?: string | null;
          command_id: string;
          created_at?: string;
        };
        Update: never;
      };
      check_ins: {
        Row: {
          id: string;
          senior_id: string;
          started_at: string;
          completed_at: string | null;
          status: CheckInStatus;
          risk_before: RiskLevel;
          risk_after: RiskLevel;
          summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          started_at?: string;
          completed_at?: string | null;
          status?: CheckInStatus;
          risk_before?: RiskLevel;
          risk_after?: RiskLevel;
          summary?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["check_ins"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          check_in_id: string;
          senior_id: string;
          sender: MessageSender;
          text: string;
          agent_id: AgentId | null;
          client_message_id: string | null;
          external_platform: string | null;
          external_message_id: string | null;
          external_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          senior_id: string;
          sender: MessageSender;
          text: string;
          agent_id?: AgentId | null;
          client_message_id?: string | null;
          external_platform?: string | null;
          external_message_id?: string | null;
          external_metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      agent_runs: {
        Row: {
          id: string;
          check_in_id: string;
          agent_id: AgentId;
          agent_name: string;
          trace_id: string;
          input: string;
          reasoning: string;
          output: string;
          output_json: Json | null;
          tags: string[];
          duration_ms: number | null;
          model_used: string | null;
          fallback: boolean;
          input_summary: string | null;
          output_summary: string | null;
          state_changes: Json;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          agent_id: AgentId;
          agent_name: string;
          trace_id: string;
          input: string;
          reasoning: string;
          output: string;
          output_json?: Json | null;
          tags?: string[];
          duration_ms?: number | null;
          model_used?: string | null;
          fallback?: boolean;
          input_summary?: string | null;
          output_summary?: string | null;
          state_changes?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_runs"]["Insert"]>;
      };
      detected_signals: {
        Row: {
          id: string;
          check_in_id: string;
          signal_type: SignalType;
          description: string;
          severity: SignalSeverity;
          source_agent_run_id: string | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          signal_type: SignalType;
          description: string;
          severity: SignalSeverity;
          source_agent_run_id?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["detected_signals"]["Insert"]>;
      };
      risk_events: {
        Row: {
          id: string;
          check_in_id: string;
          senior_id: string;
          previous_risk: RiskLevel;
          final_risk: RiskLevel;
          risk_change: RiskChange;
          policy_agent_run_id: string | null;
          reasoning: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          senior_id: string;
          previous_risk: RiskLevel;
          final_risk: RiskLevel;
          risk_change: RiskChange;
          policy_agent_run_id?: string | null;
          reasoning?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["risk_events"]["Insert"]>;
      };
      alerts: {
        Row: {
          id: string;
          check_in_id: string;
          senior_id: string;
          signal_type: SignalType;
          message: string;
          severity: SignalSeverity;
          urgent: boolean;
          reason: string | null;
          acknowledged: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          senior_id: string;
          signal_type: SignalType;
          message: string;
          severity: SignalSeverity;
          urgent?: boolean;
          reason?: string | null;
          acknowledged?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["alerts"]["Insert"]>;
      };
      briefs: {
        Row: {
          id: string;
          check_in_id: string;
          senior_id: string;
          trigger: BriefTrigger;
          for_caregiver: string;
          for_aac_volunteer: string;
          overall_risk: RiskLevel;
          key_concerns: string[];
          recommended_actions: string[];
          source_agent_run_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          senior_id: string;
          trigger: BriefTrigger;
          for_caregiver: string;
          for_aac_volunteer: string;
          overall_risk: RiskLevel;
          key_concerns?: string[];
          recommended_actions?: string[];
          source_agent_run_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["briefs"]["Insert"]>;
      };
      scheduled_jobs: {
        Row: {
          id: string;
          senior_id: string | null;
          job_type: "morning_check_in" | "follow_up" | "briefing";
          status: "pending" | "running" | "completed" | "failed" | "cancelled";
          scheduled_for: string;
          payload: Json;
          schedule_id: string | null;
          workflow_id: string | null;
          stage: ProactiveCheckInStage | null;
          idempotency_key: string | null;
          claimed_by: string | null;
          claim_expires_at: string | null;
          attempt_count: number;
          next_eligible_at: string | null;
          last_error_category: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          send_intent_at: string | null;
          send_reconciliation_required_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id?: string | null;
          job_type: "morning_check_in" | "follow_up" | "briefing";
          status?: "pending" | "running" | "completed" | "failed" | "cancelled";
          scheduled_for: string;
          payload?: Json;
          schedule_id?: string | null;
          workflow_id?: string | null;
          stage?: ProactiveCheckInStage | null;
          idempotency_key?: string | null;
          claimed_by?: string | null;
          claim_expires_at?: string | null;
          attempt_count?: number;
          next_eligible_at?: string | null;
          last_error_category?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          send_intent_at?: string | null;
          send_reconciliation_required_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scheduled_jobs"]["Insert"]>;
      };
      proactive_check_in_schedules: {
        Row: {
          id: string;
          senior_id: string;
          platform: SeniorMessagingPlatform;
          local_send_time: string;
          timezone: string;
          active_weekdays: number[];
          initial_response_minutes: number;
          retry_response_minutes: number;
          initial_message_template: string;
          retry_message_template: string;
          enabled: boolean;
          paused_at: string | null;
          pause_reason: string | null;
          paused_by_caregiver_id: string | null;
          next_run_at: string;
          last_run_at: string | null;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          platform?: SeniorMessagingPlatform;
          local_send_time?: string;
          timezone?: string;
          active_weekdays?: number[];
          initial_response_minutes?: number;
          retry_response_minutes?: number;
          initial_message_template: string;
          retry_message_template: string;
          enabled?: boolean;
          paused_at?: string | null;
          pause_reason?: string | null;
          paused_by_caregiver_id?: string | null;
          next_run_at: string;
          last_run_at?: string | null;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["proactive_check_in_schedules"]["Insert"]
        >;
      };
      proactive_check_in_workflows: {
        Row: {
          id: string;
          schedule_id: string;
          senior_id: string;
          status: ProactiveCheckInStatus;
          started_at: string;
          initial_sent_at: string | null;
          initial_client_message_id: string | null;
          retry_sent_at: string | null;
          retry_client_message_id: string | null;
          response_message_id: string | null;
          responded_at: string | null;
          escalated_at: string | null;
          late_response_at: string | null;
          queue_item_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          senior_id: string;
          status: ProactiveCheckInStatus;
          started_at: string;
          initial_sent_at?: string | null;
          initial_client_message_id?: string | null;
          retry_sent_at?: string | null;
          retry_client_message_id?: string | null;
          response_message_id?: string | null;
          responded_at?: string | null;
          escalated_at?: string | null;
          late_response_at?: string | null;
          queue_item_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["proactive_check_in_workflows"]["Insert"]
        >;
      };
      proactive_check_in_events: {
        Row: {
          id: string;
          senior_id: string;
          schedule_id: string | null;
          workflow_id: string | null;
          event_type: string;
          actor_caregiver_id: string | null;
          command_id: string | null;
          command_payload: Json | null;
          summary: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          schedule_id?: string | null;
          workflow_id?: string | null;
          event_type: string;
          actor_caregiver_id?: string | null;
          command_id?: string | null;
          command_payload?: Json | null;
          summary?: Json;
          created_at?: string;
        };
        Update: never;
      };
      whatsapp_webhook_events: {
        Row: {
          id: string;
          whatsapp_message_id: string;
          event_type: WhatsAppWebhookEventType;
          phone_number_id: string | null;
          sender_phone_e164: string | null;
          related_whatsapp_message_id: string | null;
          payload: Json;
          status: WhatsAppWebhookEventStatus;
          attempt_count: number;
          last_error: string | null;
          processing_started_at: string | null;
          orchestration_result: Json | null;
          orchestration_context: Json | null;
          orchestration_completed_at: string | null;
          selected_reply_text: string | null;
          selected_reply_agent_id: AgentId | null;
          selected_reply_client_message_id: string | null;
          outbound_status: WhatsAppOutboundStatus;
          outbound_message_id: string | null;
          received_at: string;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          whatsapp_message_id: string;
          event_type: WhatsAppWebhookEventType;
          phone_number_id?: string | null;
          sender_phone_e164?: string | null;
          related_whatsapp_message_id?: string | null;
          payload?: Json;
          status?: WhatsAppWebhookEventStatus;
          attempt_count?: number;
          last_error?: string | null;
          processing_started_at?: string | null;
          orchestration_result?: Json | null;
          orchestration_context?: Json | null;
          orchestration_completed_at?: string | null;
          selected_reply_text?: string | null;
          selected_reply_agent_id?: AgentId | null;
          selected_reply_client_message_id?: string | null;
          outbound_status?: WhatsAppOutboundStatus;
          outbound_message_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_webhook_events"]["Insert"]>;
      };
      telegram_webhook_events: {
        Row: {
          id: string;
          update_id: string;
          event_type: TelegramWebhookEventType;
          telegram_message_id: string | null;
          sender_user_id: string | null;
          chat_id: string | null;
          text_body: string | null;
          payload: Json;
          status: TelegramWebhookEventStatus;
          attempt_count: number;
          last_error: string | null;
          processing_started_at: string | null;
          orchestration_result: Json | null;
          orchestration_context: Json | null;
          orchestration_completed_at: string | null;
          selected_reply_text: string | null;
          selected_reply_agent_id: AgentId | null;
          selected_reply_client_message_id: string | null;
          outbound_status: TelegramOutboundStatus;
          outbound_message_id: string | null;
          occurred_at: string | null;
          received_at: string;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          update_id: string;
          event_type?: TelegramWebhookEventType;
          telegram_message_id?: string | null;
          sender_user_id?: string | null;
          chat_id?: string | null;
          text_body?: string | null;
          payload?: Json;
          status?: TelegramWebhookEventStatus;
          attempt_count?: number;
          last_error?: string | null;
          processing_started_at?: string | null;
          orchestration_result?: Json | null;
          orchestration_context?: Json | null;
          orchestration_completed_at?: string | null;
          selected_reply_text?: string | null;
          selected_reply_agent_id?: AgentId | null;
          selected_reply_client_message_id?: string | null;
          outbound_status?: TelegramOutboundStatus;
          outbound_message_id?: string | null;
          occurred_at?: string | null;
          received_at?: string;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["telegram_webhook_events"]["Insert"]
        >;
      };
      patterns: {
        Row: {
          id: string;
          senior_id: string;
          pattern_type: PatternType;
          status: PatternStatus;
          severity: SignalSeverity;
          first_observed_at: string;
          latest_observed_at: string;
          contributing_signal_ids: string[];
          concise_summary: string;
          recommended_action: string;
          comparison: string | null;
          usual_routine: string[];
          known_context: string[];
          memory_notes: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          pattern_type: PatternType;
          status: PatternStatus;
          severity: SignalSeverity;
          first_observed_at: string;
          latest_observed_at: string;
          contributing_signal_ids?: string[];
          concise_summary: string;
          recommended_action: string;
          comparison?: string | null;
          usual_routine?: string[];
          known_context?: string[];
          memory_notes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["patterns"]["Insert"]>;
      };
      caregiver_queue_items: {
        Row: {
          id: string;
          senior_id: string;
          pattern_id: string | null;
          alert_id: string | null;
          status: QueueStatus;
          reason: string;
          change_from_usual: string;
          recommended_action: string;
          episode_key: string | null;
          related_pattern_ids: string[];
          related_pattern_types: PatternType[];
          assigned_caregiver_id: string | null;
          snoozed_until: string | null;
          last_evidence_at: string;
          operational_risk: RiskLevel | null;
          source_type: "pattern_watch" | "proactive_check_in" | null;
          source_id: string | null;
          late_response_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          pattern_id?: string | null;
          alert_id?: string | null;
          status?: QueueStatus;
          reason: string;
          change_from_usual: string;
          recommended_action: string;
          episode_key?: string | null;
          related_pattern_ids?: string[];
          related_pattern_types?: PatternType[];
          assigned_caregiver_id?: string | null;
          snoozed_until?: string | null;
          last_evidence_at?: string;
          operational_risk?: RiskLevel | null;
          source_type?: "pattern_watch" | "proactive_check_in" | null;
          source_id?: string | null;
          late_response_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["caregiver_queue_items"]["Insert"]>;
      };
      caregiver_actions: {
        Row: {
          id: string;
          queue_item_id: string;
          senior_id: string;
          caregiver_id: string | null;
          action_type: CaregiverActionType;
          outcome_type: ContactOutcome | null;
          note: string | null;
          previous_status: QueueStatus | null;
          resulting_status: QueueStatus | null;
          command_id: string;
          assigned_caregiver_id: string | null;
          snoozed_until: string | null;
          escalation_destination: EscalationDestination | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          queue_item_id: string;
          senior_id: string;
          caregiver_id?: string | null;
          action_type: CaregiverActionType;
          outcome_type?: ContactOutcome | null;
          note?: string | null;
          previous_status?: QueueStatus | null;
          resulting_status?: QueueStatus | null;
          command_id: string;
          assigned_caregiver_id?: string | null;
          snoozed_until?: string | null;
          escalation_destination?: EscalationDestination | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["caregiver_actions"]["Insert"]>;
      };
      senior_contacts: {
        Row: {
          id: string;
          senior_id: string;
          display_name: string;
          relationship: string;
          contact_kind: ContactKind;
          preferred_language: string;
          timezone: string;
          escalation_priority: number;
          active: boolean;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          display_name: string;
          relationship: string;
          contact_kind: ContactKind;
          preferred_language?: string;
          timezone?: string;
          escalation_priority: number;
          active?: boolean;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["senior_contacts"]["Insert"]>;
      };
      contact_methods: {
        Row: {
          id: string;
          senior_contact_id: string;
          channel: ContactChannel;
          destination_normalized: string;
          verification_status: ContactVerificationStatus;
          verification_method: string | null;
          verified_at: string | null;
          method_priority: number;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          timezone: string;
          active: boolean;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          senior_contact_id: string;
          channel: ContactChannel;
          destination_normalized: string;
          verification_status?: ContactVerificationStatus;
          verification_method?: string | null;
          verified_at?: string | null;
          method_priority?: number;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          timezone?: string;
          active?: boolean;
          created_by_caregiver_id: string;
          updated_by_caregiver_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contact_methods"]["Insert"]>;
      };
      contact_consent_events: {
        Row: {
          id: string;
          senior_id: string;
          senior_contact_id: string;
          contact_method_id: string;
          event_type: ConsentEventType;
          permitted_categories: NotificationCategory[];
          allow_urgent_quiet_hours: boolean;
          confirmation_method: string;
          confirmed_at: string;
          expires_at: string | null;
          note: string | null;
          actor_caregiver_id: string;
          command_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          senior_contact_id: string;
          contact_method_id: string;
          event_type: ConsentEventType;
          permitted_categories?: NotificationCategory[];
          allow_urgent_quiet_hours?: boolean;
          confirmation_method: string;
          confirmed_at: string;
          expires_at?: string | null;
          note?: string | null;
          actor_caregiver_id: string;
          command_id: string;
          created_at?: string;
        };
        Update: never;
      };
      contact_plan_audit_events: {
        Row: {
          id: string;
          senior_id: string;
          senior_contact_id: string | null;
          contact_method_id: string | null;
          event_type: string;
          before_summary: Json | null;
          after_summary: Json;
          actor_caregiver_id: string;
          command_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          senior_contact_id?: string | null;
          contact_method_id?: string | null;
          event_type: string;
          before_summary?: Json | null;
          after_summary: Json;
          actor_caregiver_id: string;
          command_id: string;
          created_at?: string;
        };
        Update: never;
      };
      notification_recipient_decisions: {
        Row: {
          id: string;
          senior_id: string;
          queue_item_id: string | null;
          caregiver_action_id: string | null;
          notification_category: NotificationCategory;
          escalation_destination: EscalationDestination;
          requested_channel: ContactChannel | null;
          evaluation_time: string;
          selected_contact_id: string | null;
          selected_method_id: string | null;
          result: "candidate_selected" | "no_eligible_contact";
          explanation: string;
          skipped_reasons: Json;
          command_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          senior_id: string;
          queue_item_id?: string | null;
          caregiver_action_id?: string | null;
          notification_category: NotificationCategory;
          escalation_destination: EscalationDestination;
          requested_channel?: ContactChannel | null;
          evaluation_time: string;
          selected_contact_id?: string | null;
          selected_method_id?: string | null;
          result: "candidate_selected" | "no_eligible_contact";
          explanation: string;
          skipped_reasons?: Json;
          command_id: string;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_automatic_senior_context: {
        Args: {
          p_command_id: string;
          p_senior_id: string;
          p_source_message_id: string;
          p_payload_json: Json;
        };
        Returns: Json;
      };
      correct_senior_context: {
        Args: {
          p_command_id: string;
          p_senior_id: string;
          p_store: ContextStore;
          p_context_id: string;
          p_expected_updated_at: string;
          p_replacement_json: Json;
          p_reason: string;
        };
        Returns: Json;
      };
      archive_senior_context: {
        Args: {
          p_command_id: string;
          p_senior_id: string;
          p_store: ContextStore;
          p_context_id: string;
          p_expected_updated_at: string;
          p_reason: string;
        };
        Returns: Json;
      };
      claim_whatsapp_webhook_event: {
        Args: { p_event_id: string };
        Returns: Database["public"]["Tables"]["whatsapp_webhook_events"]["Row"][];
      };
      claim_telegram_webhook_event: {
        Args: { p_event_id: string };
        Returns: Database["public"]["Tables"]["telegram_webhook_events"]["Row"][];
      };
      record_caregiver_queue_action: {
        Args: {
          p_queue_item_id: string;
          p_action_type: CaregiverActionType;
          p_command_id: string;
          p_expected_updated_at: string;
          p_outcome_type?: ContactOutcome | null;
          p_note?: string | null;
          p_assigned_caregiver_id?: string | null;
          p_snoozed_until?: string | null;
        };
        Returns: Json;
      };
      escalate_caregiver_queue_case: {
        Args: {
          p_queue_item_id: string;
          p_command_id: string;
          p_expected_updated_at: string;
          p_escalation_destination: EscalationDestination;
          p_notification_category: NotificationCategory;
          p_note: string;
        };
        Returns: Json;
      };
      create_senior_contact: { Args: Record<string, Json>; Returns: Json };
      update_senior_contact: { Args: Record<string, Json>; Returns: Json };
      create_contact_method: { Args: Record<string, Json>; Returns: Json };
      update_contact_method: { Args: Record<string, Json>; Returns: Json };
      record_contact_consent: { Args: Record<string, Json>; Returns: Json };
      preview_notification_recipient: { Args: Record<string, Json>; Returns: Json };
      manage_proactive_check_in_schedule: {
        Args: {
          p_senior_id: string;
          p_command_id: string;
          p_action: "configure" | "pause" | "resume" | "manual_run";
          p_platform: SeniorMessagingPlatform;
          p_local_send_time: string;
          p_timezone: string;
          p_active_weekdays: number[];
          p_initial_response_minutes: number;
          p_retry_response_minutes: number;
          p_initial_message_template: string;
          p_retry_message_template: string;
          p_reason: string | null;
          p_now: string;
        };
        Returns: Json;
      };
      enqueue_due_proactive_check_ins: {
        Args: { p_limit: number; p_now: string };
        Returns: number;
      };
      claim_due_proactive_check_in_jobs: {
        Args: {
          p_limit: number;
          p_worker_id: string;
          p_now: string;
        };
        Returns: Database["public"]["Tables"]["scheduled_jobs"]["Row"][];
      };
      advance_proactive_check_in_job: {
        Args: Record<string, Json>;
        Returns: Json;
      };
      retry_proactive_check_in_job: {
        Args: Record<string, Json>;
        Returns: undefined;
      };
      record_proactive_check_in_response: {
        Args: {
          p_senior_id: string;
          p_client_message_id: string;
          p_responded_at: string;
        };
        Returns: Json;
      };
      finalize_proactive_check_in_timeout: {
        Args: { p_job_id: string; p_worker_id: string; p_now: string };
        Returns: Json;
      };
      reset_trustkaki_demo: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: {
      risk_level: RiskLevel;
      agent_id: AgentId;
      signal_type: SignalType;
      signal_severity: SignalSeverity;
      message_sender: MessageSender;
      check_in_status: CheckInStatus;
      risk_change: RiskChange;
      brief_trigger: BriefTrigger;
    };
    CompositeTypes: Record<string, never>;
  };
}
