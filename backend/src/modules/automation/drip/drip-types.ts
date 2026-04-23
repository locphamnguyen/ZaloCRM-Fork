/**
 * drip-types.ts — shared types for drip engine
 */

export type DripEnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type AutomationLogStatus = 'sent' | 'failed' | 'rate_limited' | 'skipped';
export type DripStartTrigger = 'manual' | 'webhook' | 'tag';
export type StopReason = 'replied' | 'tagged' | 'inactive' | 'manual';

export interface DripEnrollmentClaim {
  id: string;
  campaign_id: string;
  contact_id: string;
  conversation_id: string;
  zalo_account_id: string;
  current_step: number;
  scheduled_at: Date;
}
