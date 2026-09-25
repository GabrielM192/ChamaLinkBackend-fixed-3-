import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  ShieldAlert,
  HeartHandshake,
  Landmark,
  Users,
  Gauge,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useMyGroups } from '../hooks/useMyGroups';
import { getMemberFinancialProfile, type MemberFinancialProfile } from '../api/reports';
import { ProfileCard, StatRow } from '../components/ProfileCard';
import { StatusBadge } from '../components/StatusBadge';
import { Figure } from '../components/Figure';
import {
  financialScoreInfo,
  loanRiskInfo,
  loanStatusInfo,
  memberStatusInfo,
  groupRoleLabel,
} from '../lib/status';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sw-TZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function MemberProfilePage() {
  const { user } = useAuth();
  // BUG FIX: this page used to call a hardcoded SAMPLE_GROUP_ID that the
  // logged-in user was very often not a member of, which the backend
  // correctly rejected - but the frontend's global 401 handler read that
  // rejection as "your session is invalid" and logged the person straight
  // back out to /login. Real group selection (a member can belong to
  // more than one group) is still real product work for later; for now
  // this uses the first group /Group/my-groups returns, same as
  // MkobaPage.tsx.
  const { activeGroupId, loading: groupsLoading, error: groupsError } = useMyGroups();
  const [profile, setProfile] = useState<MemberFinancialProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !activeGroupId) return;
    let cancelled = false;

    // Reset the previous group's profile before fetching the new one so a
    // switch shows the loading state - never the previous group's numbers
    // (which is the "wrong group data" risk the switcher exists to remove).
    setProfile(null);
    setError(null);

    getMemberFinancialProfile(activeGroupId, user.userId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia wasifu wako wa kifedha.');
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeGroupId]);

  if (groupsLoading) {
    return (
      <div className="flex items-center gap-2 text-ink-600 text-sm py-12 justify-center">
        <Loader2 size={18} className="animate-spin" />
        Inapakia makundi yako...
      </div>
    );
  }

  if (groupsError) {
    return (
      <div className="rounded-xl bg-standing-overdue-bg text-standing-overdue px-4 py-3 text-sm">
        {groupsError}
      </div>
    );
  }

  if (!activeGroupId) {
    return (
      <div className="rounded-xl bg-paper-raised border border-ink-100 px-4 py-6 text-sm text-ink-700 text-center">
        Bado hujajiunga na kikundi chochote.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-standing-overdue-bg text-standing-overdue px-4 py-3 text-sm">
        {error}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-ink-600 text-sm py-12 justify-center">
        <Loader2 size={18} className="animate-spin" />
        Inapakia wasifu wako...
      </div>
    );
  }

  const statusInfo = memberStatusInfo(profile.status);
  const scoreInfo = financialScoreInfo(profile.financialScore);
  const riskInfo = loanRiskInfo(profile.loanRiskCategory);
  const compliancePct = Math.max(0, Math.min(100, profile.contributionCompliancePercent));

  return (
    <div className="space-y-6">
      {/* Header - who this is, at a glance */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border border-ink-100 rounded-xl bg-paper-raised p-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-ink-950">{profile.memberName}</h1>
          <p className="text-sm text-ink-700 mt-0.5">
            {groupRoleLabel(profile.role)} · {profile.groupName} · Mwanachama tangu{' '}
            {formatDate(profile.joinedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
          <StatusBadge label={`Alama: ${scoreInfo.label}`} tone={scoreInfo.tone} />
        </div>
      </motion.div>

      {/* Card grid - each section is its own honest slice of the DTO,
          not a re-derived summary, so a leader can trust the numbers
          match what the backend actually computed. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <ProfileCard title="Michango" icon={Wallet} delay={0.05}>
          <dl>
            <StatRow label="Michango Halisi">
              <Figure value={profile.totalContributions} />
            </StatRow>
            <StatRow label="Ilivyotarajiwa">
              <Figure value={profile.expectedContributions} />
            </StatRow>
          </dl>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
              <span>Uzingatiaji wa Michango</span>
              <span className="figure font-semibold">
                {profile.contributionCompliancePercent.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${compliancePct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                className={
                  compliancePct >= 90
                    ? 'h-full bg-standing-good'
                    : compliancePct >= 70
                      ? 'h-full bg-standing-warn'
                      : 'h-full bg-standing-overdue'
                }
              />
            </div>
          </div>
        </ProfileCard>

        <ProfileCard title="Wajibu wa Kifedha" icon={ShieldAlert} delay={0.1}>
          <dl>
            <StatRow label="Deni Lililopo">
              <Figure value={profile.outstandingDebt} />
            </StatRow>
            <StatRow label="Lililopitisha Muda">
              <Figure value={profile.overdueDebt} />
            </StatRow>
            <StatRow label="Deni Lililokwisha Lipwa">
              <Figure value={profile.totalDebtCleared} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Adhabu (Fine)" icon={ShieldAlert} delay={0.15}>
          <dl>
            <StatRow label="Adhabu Iliyopo">
              <Figure value={profile.outstandingFines} />
            </StatRow>
            <StatRow label="Adhabu Iliyolipwa">
              <Figure value={profile.finesPaid} />
            </StatRow>
            <StatRow label="Jumla ya Adhabu Zote">
              <Figure value={profile.totalFinesIssued} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Ustawi" icon={HeartHandshake} delay={0.2}>
          <dl>
            <StatRow label="Alichangia Ustawini">
              <Figure value={profile.welfareContributions} />
            </StatRow>
            <StatRow label="Amepokea Msaada">
              <Figure value={profile.benefitsReceived} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Mikopo" icon={Landmark} delay={0.25}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-ink-600">Hali ya Mikopo</span>
            <StatusBadge label={riskInfo.label} tone={riskInfo.tone} />
          </div>
          <dl>
            <StatRow label="Deni la Mkopo Lililopo">
              <Figure value={profile.activeLoansOutstanding} />
            </StatRow>
            <StatRow label="Jumla Aliyokopa">
              <Figure value={profile.totalBorrowed} />
            </StatRow>
            <StatRow label="Jumla Aliyolipa">
              <Figure value={profile.totalRepaid} />
            </StatRow>
            <StatRow label="Mikopo Inayoendelea">{profile.activeLoansCount}</StatRow>
            <StatRow label="Mikopo Iliyochelewa">{profile.overdueLoansCount}</StatRow>
          </dl>

          {profile.loans.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-ink-100 pt-3">
              {profile.loans.slice(0, 4).map((loan) => {
                const loanInfo = loanStatusInfo(loan.status, loan.isOverdue);
                return (
                  <li key={loan.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">
                      {loan.purpose || 'Mkopo'} ·{' '}
                      <span className="figure">
                        TSH {loan.principalAmount.toLocaleString('en-US')}
                      </span>
                    </span>
                    <StatusBadge label={loanInfo.label} tone={loanInfo.tone} />
                  </li>
                );
              })}
            </ul>
          )}
        </ProfileCard>

        <ProfileCard title="Uongozi" icon={Users} delay={0.3}>
          <dl>
            <StatRow label="Maamuzi ya Uongozi Aliyoshiriki">
              {profile.approvalsParticipated}
            </StatRow>
          </dl>
        </ProfileCard>
      </div>

      {/* Overall score - a footer, not a card, since it's a summary of
          everything above rather than its own slice of data. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-2 text-xs text-ink-500 justify-center pt-2"
      >
        <Gauge size={14} />
        Alama ya kifedha ({scoreInfo.label}) na hali ya mikopo ({riskInfo.label}) zinatokana na
        data halisi hapo juu.
      </motion.div>
    </div>
  );
}
