// Central place that turns backend enum strings (English, e.g.
// "GoodStanding", "Suspended") into what a person actually reads
// (Swahili) and which of the app's three semantic tones
// (standing-good / standing-warn / standing-overdue) applies. Keeping
// this in one file means every screen that shows a status label reads
// it the same way - a badge on the Dashboard and one on a future
// Reports Engine table will never disagree about what "Suspended"
// means visually.
export type StatusTone = 'good' | 'warn' | 'overdue' | 'neutral';

const LOAN_RISK_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  GoodStanding: { label: 'Hali Nzuri', tone: 'good' },
  PreviousDelinquency: { label: 'Aliwahi Kuchelewa', tone: 'warn' },
  CurrentOverdue: { label: 'Anadaiwa Sasa', tone: 'overdue' },
};

const FINANCIAL_SCORE_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  A: { label: 'A · Bora', tone: 'good' },
  B: { label: 'B · Nzuri', tone: 'good' },
  C: { label: 'C · Hatarini', tone: 'warn' },
  D: { label: 'D · Mdaiwa', tone: 'overdue' },
};

const MEMBER_STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  New: { label: 'Mwanachama Mpya', tone: 'neutral' },
  Active: { label: 'Hai', tone: 'good' },
  Warning: { label: 'Ana Onyo', tone: 'warn' },
  EligibleForExpulsion: { label: 'Hatua ya Kuondolewa', tone: 'overdue' },
  Inactive: { label: 'Halihai', tone: 'neutral' },
  Suspended: { label: 'Amesimamishwa', tone: 'overdue' },
  Exited: { label: 'Ametoka', tone: 'neutral' },
};

const GROUP_ROLE_LABELS: Record<string, string> = {
  Chairperson: 'Mwenyekiti',
  Treasurer: 'Mtunza Hazina',
  Secretary: 'Katibu',
  Member: 'Mwanachama',
  MemberRepresentative: 'Mwakilishi wa Wanachama',
};

const LOAN_STATUS_LABELS: Record<string, string> = {
  Active: 'Unaendelea',
  Repaid: 'Umelipwa',
  Defaulted: 'Umeshindwa Kulipwa',
};

export function loanStatusInfo(status: string, isOverdue: boolean): { label: string; tone: StatusTone } {
  if (status === 'Defaulted') return { label: LOAN_STATUS_LABELS.Defaulted, tone: 'overdue' };
  if (status === 'Active' && isOverdue) return { label: 'Umechelewa', tone: 'overdue' };
  if (status === 'Active') return { label: LOAN_STATUS_LABELS.Active, tone: 'good' };
  if (status === 'Repaid') return { label: LOAN_STATUS_LABELS.Repaid, tone: 'good' };
  return { label: status, tone: 'neutral' };
}

export function loanRiskInfo(value: string): { label: string; tone: StatusTone } {
  return LOAN_RISK_LABELS[value] ?? { label: value, tone: 'neutral' };
}

export function financialScoreInfo(value: string): { label: string; tone: StatusTone } {
  return FINANCIAL_SCORE_LABELS[value] ?? { label: value, tone: 'neutral' };
}

export function memberStatusInfo(value: string): { label: string; tone: StatusTone } {
  return MEMBER_STATUS_LABELS[value] ?? { label: value, tone: 'neutral' };
}

export function groupRoleLabel(value: string): string {
  return GROUP_ROLE_LABELS[value] ?? value;
}
