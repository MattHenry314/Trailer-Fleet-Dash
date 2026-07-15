export interface Assignment {
  id: number;
  trailer_key: string;
  opportunity_id: number | null;
  customer: string;
  start_date: string;
  end_date: string;
  source: string;
  active: number;
}

export interface Trailer {
  trailerKey: string;
  trailerId: string;
  trailerName: string;
  category: string | null;
  productType: string | null;
  applicationClass: string;
  bsl2Suitability: number | null;
  pharmacySuitability: number | null;
  readinessScore: number;
  hybridAllowed: boolean;
  matchTier: string | null;
  matchNotes: string | null;
  currentClient: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  status: string | null;
  actualMonthlyRent: number | null;
  isUnpriced: boolean;
  benchmarkShortTerm: number;
  benchmarkLongTerm: number;
  varianceVsShortTerm: number | null;
  varianceVsLongTerm: number | null;
  trueAvailableDate: string | null;
  readyForServiceDate: string | null;
  readinessConflict: boolean;
  excludedByRule: boolean;
  excludeReason: string | null;
  pairedNonCore: boolean;
  soldHistorical: boolean;
  matchable: boolean;
  hasAppOverride: boolean;
  assignments: Assignment[];
  raw: Record<string, unknown>;
}

export interface Opportunity {
  id: number;
  customer: string;
  projectName: string;
  category: 'Pharmacy' | 'BSL2';
  requiredStart: string;
  requiredEnd: string;
  customerRate: number | null;
  rateStage: string;
  status: string;
  assignedTrailerKey: string | null;
  recommendedStart: string | null;
  recommendedEnd: string | null;
  matchNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingException {
  key: string;
  trailerKey: string;
  trailerId: string;
  trailerName: string;
  type: string;
  detail: string;
  status: string;
  note: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface RateHistoryEntry {
  id: number;
  trailer_key: string;
  customer: string | null;
  monthly_rate: number | null;
  rate_status: string | null;
  effective_start: string | null;
  effective_end: string | null;
  source: string | null;
  notes: string | null;
  user: string | null;
  created_at: string;
}

export type Role = 'public' | 'viewer' | 'editor' | 'owner';

export interface Session {
  email: string | null;
  role: Role;
  token: string | null;
}
