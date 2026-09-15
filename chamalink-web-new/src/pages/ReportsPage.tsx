import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Landmark,
  ShieldAlert,
  CalendarClock,
  Share2,
  Wallet,
  Scale,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Loader2,
  Check,
  Copy,
  HandCoins,
  ArrowLeftRight,
  History,
  LineChart,
} from 'lucide-react';
import { useMyGroups } from '../hooks/useMyGroups';
import {
  getGroupFinancialSummary,
  getCollectionRate,
  getDefaulters,
  getGroupBalance,
  getMembersReport,
  getLoanPortfolio,
  getFines,
  getDebts,
  getEvents,
  getWithdrawals,
  getMemberRegistry,
  getGroupMembersSummary,
  getWhatsAppSummary,
  getComplianceSummary,
  getComplianceTrend,
  type GroupFinancialSummary,
  type CollectionRate,
  type Defaulter,
  type GroupBalance,
  type MemberReportRow,
  type LoanPortfolio,
  type Fine,
  type Debt,
  type EventReport,
  type WithdrawalResponse,
  type MemberRegistryRow,
  type MemberStatusRow,
  type WhatsAppSummary,
  type ComplianceSummaryRow,
  type ComplianceTrend,
} from '../api/reports';
import { ProfileCard, StatRow } from '../components/ProfileCard';
import { StatusBadge } from '../components/StatusBadge';
import { Figure } from '../components/Figure';
import { Tabs, type Tab } from '../components/Tabs';
import { memberStatusInfo, groupRoleLabel, type StatusTone } from '../lib/status';

// ── helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sw-TZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sw-TZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Fine enum: 1=Pending, 2=PartiallyPaid, 3=Paid, 4=Waived
function fineStatusInfo(s: number): { label: string; tone: StatusTone } {
  switch (s) {
    case 3: return { label: 'Imelipwa', tone: 'good' };
    case 2: return { label: 'Imelipwa Sehemu', tone: 'warn' };
    case 4: return { label: 'Imesamehewa', tone: 'neutral' };
    case 1: return { label: 'Inasubiri', tone: 'overdue' };
    default: return { label: String(s), tone: 'neutral' };
  }
}

// Debt enum: 1=Outstanding, 2=Cleared, 3=Waived
function debtStatusInfo(s: number): { label: string; tone: StatusTone } {
  switch (s) {
    case 2: return { label: 'Imelipwa', tone: 'good' };
    case 3: return { label: 'Imesamehewa', tone: 'neutral' };
    case 1: return { label: 'Haloadaiwa', tone: 'overdue' };
    default: return { label: String(s), tone: 'neutral' };
  }
}

// Fine reason: 1=LateMonthlyContribution, 2=WelfareBalanceBelowMinimum, 3=Other
function fineReasonLabel(s: number): string {
  switch (s) {
    case 1: return 'Kuchelewa Mchango';
    case 2: return 'Salio la Ustawi Chini ya Chini';
    case 3: return 'Sababu Nyingine';
    default: return '—';
  }
}

// Withdrawal status is already a string (Status.ToString() in the controller).
function withdrawalStatusInfo(s: string): { label: string; tone: StatusTone } {
  switch (s) {
    case 'Paid': return { label: 'Imelipwa', tone: 'good' };
    case 'Approved': return { label: 'Imeidhinishwa', tone: 'good' };
    case 'Rejected': return { label: 'Imekataliwa', tone: 'overdue' };
    case 'Pending':
    default: return { label: 'Inasubiri Idhini', tone: 'warn' };
  }
}

// ── loading / error / empty shared bits ───────────────────────────────

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-600 text-sm py-12 justify-center">
      <Loader2 size={18} className="animate-spin" />
      {text}
    </div>
  );
}

function ErrorState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-standing-overdue-bg text-standing-overdue px-4 py-3 text-sm">
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm text-standing-good py-4 text-center">{text}</p>
  );
}

// ── tab definitions ───────────────────────────────────────────────────

const TABS: Tab[] = [
  { id: 'muhtasari', label: 'Muhtasari', icon: LayoutDashboard },
  { id: 'wanachama', label: 'Wanachama', icon: Users },
  { id: 'mikopo', label: 'Mikopo', icon: Landmark },
  { id: 'deni-faini', label: 'Deni & Faini', icon: ShieldAlert },
  { id: 'uzingatiaji', label: 'Uzingatiaji', icon: History },
  { id: 'matukio', label: 'Matukio & Malipo', icon: CalendarClock },
  { id: 'shiriki', label: 'Shiriki', icon: Share2 },
];

// ── 1. Muhtasari tab ─────────────────────────────────────────────────

interface MuhtasariData {
  summary: GroupFinancialSummary;
  collectionRate: CollectionRate;
  balance: GroupBalance;
  defaulters: Defaulter[];
  members: MemberReportRow[];
}

function MuhtasariTab({ groupId }: { groupId: string }) {
  const [data, setData] = useState<MuhtasariData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setData(null);
    setError(null);

    Promise.all([
      getGroupFinancialSummary(groupId),
      getCollectionRate(groupId),
      getDefaulters(groupId),
      getGroupBalance(groupId),
      getMembersReport(groupId),
    ])
      .then(([summary, collectionRate, defaulters, balance, members]) => {
        if (!cancelled) setData({ summary, collectionRate, defaulters, balance, members });
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia muhtasari wa kikundi.');
      });

    return () => { cancelled = true; };
  }, [groupId]);

  if (error) return <ErrorState text={error} />;
  if (!data) return <LoadingState text="Inapakia muhtasari..." />;

  const { summary, collectionRate, defaulters, balance, members } = data;
  const ratePct = Math.max(0, Math.min(100, collectionRate.collectionRatePercent));

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border border-ink-100 rounded-xl bg-paper-raised p-6"
      >
        <h1 className="text-xl font-semibold text-ink-950">Ripoti za {summary.groupName}</h1>
        <p className="text-sm text-ink-700 mt-0.5">
          {summary.totalMembers} wanachama · {summary.activeMembers} hai ·{' '}
          {summary.openEventsCount} matukio yanayoendelea ·{' '}
          {summary.pendingWithdrawalsCount} malipo yanasubiri idhini
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <ProfileCard title="Uzingatiaji wa Michango" icon={TrendingUp} delay={0.05}>
          <dl>
            <StatRow label="Ilivyotarajiwa (Mwezi Huu)">
              <Figure value={collectionRate.expectedAmount} />
            </StatRow>
            <StatRow label="Iliyokusanywa">
              <Figure value={collectionRate.collectedAmount} />
            </StatRow>
          </dl>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
              <span>Kiwango cha Ukusanyaji</span>
              <span className="figure font-semibold">
                {collectionRate.collectionRatePercent.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${ratePct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                className={
                  ratePct >= 90
                    ? 'h-full bg-standing-good'
                    : ratePct >= 70
                      ? 'h-full bg-standing-warn'
                      : 'h-full bg-standing-overdue'
                }
              />
            </div>
          </div>
        </ProfileCard>

        <ProfileCard title="Fedha Taslimu" icon={Wallet} delay={0.1}>
          <dl>
            <StatRow label="Taslimu Iliyopo">
              <Figure value={balance.cashAvailable} />
            </StatRow>
            <StatRow label="Michango Jumla">
              <Figure value={balance.totalContributions} />
            </StatRow>
            <StatRow label="Ustawi Uliopo">
              <Figure value={balance.totalWelfareHeld} />
            </StatRow>
            <StatRow label="Malipo Yaliyotolewa">
              <Figure value={balance.totalWithdrawalsPaid} />
            </StatRow>
            <StatRow label="Mitume ya M-Koba">
              <Figure value={balance.totalWalletWithdrawals} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Mali ya Kikundi" icon={Scale} delay={0.15}>
          <dl>
            <StatRow label="Mikopo Iliyopo Nje">
              <Figure value={balance.outstandingLoans} />
            </StatRow>
            <StatRow label="Adhabu Zilizosalia">
              <Figure value={balance.outstandingFines} />
            </StatRow>
            <StatRow label="Madeni Yaliyosalia">
              <Figure value={balance.outstandingDebts} />
            </StatRow>
            <StatRow label="Jumla ya Mali (Total Assets)">
              <Figure value={balance.totalAssets} />
            </StatRow>
          </dl>
        </ProfileCard>
      </div>

      <ProfileCard title="Wanachama Wenye Deni (Defaulters)" icon={AlertTriangle} delay={0.2}>
        {defaulters.length === 0 ? (
          <EmptyState text="Hakuna mwanachama mwenye deni au adhabu iliyosalia kwa sasa." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Mwanachama</th>
                  <th className="px-2 py-2 font-semibold">Simu</th>
                  <th className="px-2 py-2 font-semibold text-right">Deni</th>
                  <th className="px-2 py-2 font-semibold text-right">Adhabu</th>
                  <th className="px-2 py-2 font-semibold">Mchango wa Mwisho</th>
                  <th className="px-2 py-2 font-semibold text-right">Siku za Kuchelewa</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((d) => (
                  <tr key={d.userId} className="border-t border-ink-100">
                    <td className="px-2 py-2 text-ink-950 font-medium">{d.memberName}</td>
                    <td className="px-2 py-2 text-ink-700">{d.phoneNumber}</td>
                    <td className="px-2 py-2 text-right"><Figure value={d.outstandingDebt} /></td>
                    <td className="px-2 py-2 text-right"><Figure value={d.outstandingFine} /></td>
                    <td className="px-2 py-2 text-ink-700">{formatDate(d.lastContributionDate)}</td>
                    <td className="px-2 py-2 text-right">
                      <StatusBadge
                        label={`${d.daysLate} siku`}
                        tone={d.daysLate > 30 ? 'overdue' : d.daysLate > 0 ? 'warn' : 'neutral'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>

      <ProfileCard title="Ripoti ya Wanachama Wote" icon={ClipboardList} delay={0.25}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                <th className="px-2 py-2 font-semibold">Mwanachama</th>
                <th className="px-2 py-2 font-semibold">Hali</th>
                <th className="px-2 py-2 font-semibold text-right">Akiba</th>
                <th className="px-2 py-2 font-semibold text-right">Deni</th>
                <th className="px-2 py-2 font-semibold text-right">Adhabu</th>
                <th className="px-2 py-2 font-semibold text-right">Mkopo</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const statusInfo = memberStatusInfo(m.status);
                return (
                  <tr key={m.userId} className="border-t border-ink-100">
                    <td className="px-2 py-2 text-ink-950 font-medium">{m.memberName}</td>
                    <td className="px-2 py-2">
                      <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                    </td>
                    <td className="px-2 py-2 text-right"><Figure value={m.savingsBalance} /></td>
                    <td className="px-2 py-2 text-right"><Figure value={m.outstandingDebt} /></td>
                    <td className="px-2 py-2 text-right"><Figure value={m.outstandingFine} /></td>
                    <td className="px-2 py-2 text-right"><Figure value={m.outstandingLoan} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ProfileCard>
    </div>
  );
}

// ── 2. Wanachama tab ─────────────────────────────────────────────────

interface WanachamaData {
  registry: MemberRegistryRow[];
  compliance: MemberStatusRow[];
}

function WanachamaTab({ groupId }: { groupId: string }) {
  const [data, setData] = useState<WanachamaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setData(null);
    setError(null);

    Promise.all([getMemberRegistry(groupId), getGroupMembersSummary(groupId)])
      .then(([registry, compliance]) => {
        if (!cancelled) setData({ registry, compliance });
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia taarifa za wanachama.');
      });

    return () => { cancelled = true; };
  }, [groupId]);

  if (error) return <ErrorState text={error} />;
  if (!data) return <LoadingState text="Inapakia wanachama..." />;

  const { registry, compliance } = data;
  const paidCount = compliance.filter((c) => c.hasPaidCurrentMonth).length;
  const unpaidPct = compliance.length > 0
    ? ((compliance.length - paidCount) / compliance.length) * 100
    : 0;

  return (
    <div className="space-y-5">
      <ProfileCard title="Uzingatiaji wa Mchango wa Mwezi" icon={TrendingUp} delay={0.05}>
        <dl>
          <StatRow label="Wameshalipa Mwezi Huu">
            {paidCount} kati ya {compliance.length}
          </StatRow>
          <StatRow label="Bado Hawajalipa">
            {compliance.length - paidCount}
          </StatRow>
        </dl>
        <div className="mt-3">
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${100 - unpaidPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
              className="h-full bg-standing-good"
            />
          </div>
        </div>
      </ProfileCard>

      <ProfileCard title="Hali ya Mchango wa Mwezi kwa Mwanachama" icon={HandCoins} delay={0.1}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                <th className="px-2 py-2 font-semibold">Mwanachama</th>
                <th className="px-2 py-2 font-semibold text-right">Lengo</th>
                <th className="px-2 py-2 font-semibold text-right">Ametoa</th>
                <th className="px-2 py-2 font-semibold text-right">Salio la Ziada</th>
                <th className="px-2 py-2 font-semibold text-right">Adhabu Isiyolipwa</th>
                <th className="px-2 py-2 font-semibold">Hali</th>
              </tr>
            </thead>
            <tbody>
              {compliance.map((c) => (
                <tr key={c.userId} className="border-t border-ink-100">
                  <td className="px-2 py-2 text-ink-950 font-medium">{c.memberName}</td>
                  <td className="px-2 py-2 text-right"><Figure value={c.monthlyContributionTarget} /></td>
                  <td className="px-2 py-2 text-right"><Figure value={c.totalMonthlyPaidThisMonth} /></td>
                  <td className="px-2 py-2 text-right"><Figure value={c.advanceBalance} /></td>
                  <td className="px-2 py-2 text-right"><Figure value={c.pendingFineAmount} /></td>
                  <td className="px-2 py-2">
                    <StatusBadge
                      label={c.hasPaidCurrentMonth ? 'Amelipa' : 'Hajalipa'}
                      tone={c.hasPaidCurrentMonth ? 'good' : 'overdue'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ProfileCard>

      <ProfileCard title="Usajili wa Wanachama" icon={Users} delay={0.15}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                <th className="px-2 py-2 font-semibold">Jina</th>
                <th className="px-2 py-2 font-semibold">Simu</th>
                <th className="px-2 py-2 font-semibold">Namba</th>
                <th className="px-2 py-2 font-semibold">Nafasi</th>
                <th className="px-2 py-2 font-semibold">Hali</th>
                <th className="px-2 py-2 font-semibold">Alijiunga</th>
                <th className="px-2 py-2 font-semibold text-right">Michango</th>
              </tr>
            </thead>
            <tbody>
              {registry.map((m) => {
                const statusInfo = memberStatusInfo(m.status);
                return (
                  <tr key={m.userId} className="border-t border-ink-100">
                    <td className="px-2 py-2 text-ink-950 font-medium">{m.name}</td>
                    <td className="px-2 py-2 text-ink-700">{m.phone || '—'}</td>
                    <td className="px-2 py-2 text-ink-700">{m.memberNumber || '—'}</td>
                    <td className="px-2 py-2 text-ink-700">{groupRoleLabel(m.role)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                    </td>
                    <td className="px-2 py-2 text-ink-700">{formatDate(m.joinedAt)}</td>
                    <td className="px-2 py-2 text-right text-ink-950 font-medium">
                      {m.totalContributionsCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ProfileCard>
    </div>
  );
}

// ── 3. Mikopo tab ────────────────────────────────────────────────────

function MikopoTab({ groupId }: { groupId: string }) {
  const [portfolio, setPortfolio] = useState<LoanPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setPortfolio(null);
    setError(null);

    getLoanPortfolio(groupId)
      .then((d) => { if (!cancelled) setPortfolio(d); })
      .catch(() => { if (!cancelled) setError('Imeshindwa kupakia portofolio ya mikopo.'); });

    return () => { cancelled = true; };
  }, [groupId]);

  if (error) return <ErrorState text={error} />;
  if (!portfolio) return <LoadingState text="Inapakia mikopo..." />;

  const hasActivity = portfolio.totalIssued > 0 || portfolio.activeLoansCount > 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <ProfileCard title="Jumla ya Mikopo" icon={Landmark} delay={0.05}>
          <dl>
            <StatRow label="Imetolewa Jumla">
              <Figure value={portfolio.totalIssued} />
            </StatRow>
            <StatRow label="Imerejeshwa">
              <Figure value={portfolio.totalRecovered} />
            </StatRow>
            <StatRow label="Inasalia Nje">
              <Figure value={portfolio.totalOutstanding} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Hali ya Mikopo" icon={ClipboardList} delay={0.1}>
          <dl>
            <StatRow label="Inayoendelea">{portfolio.activeLoansCount}</StatRow>
            <StatRow label="Imelipwa Kamili">{portfolio.repaidLoansCount}</StatRow>
            <StatRow label="Imechelewa">{portfolio.overdueLoansCount}</StatRow>
            <StatRow label="Imeshindwa Kulipwa">{portfolio.defaultedLoansCount}</StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Hatari za Mikopo" icon={AlertTriangle} delay={0.15}>
          <dl>
            <StatRow label="Kiasi Kilichochelewa">
              <Figure value={portfolio.overdueAmount} />
            </StatRow>
            <StatRow label="Kiasi Kilichokosa">
              <Figure value={portfolio.defaultedAmount} />
            </StatRow>
          </dl>
        </ProfileCard>
      </div>

      {!hasActivity && (
        <ProfileCard title="Orodha ya Mikopo" icon={Landmark} delay={0.2}>
          <EmptyState text="Hakuna mikopo inayoendelea kwa sasa. Kikundi bado hakitajiri mikopo." />
        </ProfileCard>
      )}
    </div>
  );
}

// ── 4. Deni & Faini tab ──────────────────────────────────────────────

interface DeniFainiData {
  members: MemberReportRow[];
  fines: Fine[];
  debts: Debt[];
}

function DeniFainiTab({ groupId }: { groupId: string }) {
  const [data, setData] = useState<DeniFainiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setData(null);
    setError(null);

    // Members report is loaded alongside fines/debts so we can
    // cross-reference userId → memberName (Fine/Debt services return
    // raw entities without .Include(User)).
    Promise.all([
      getMembersReport(groupId),
      getFines(groupId),
      getDebts(groupId),
    ])
      .then(([members, fines, debts]) => {
        if (!cancelled) setData({ members, fines, debts });
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia deni na adhabu.');
      });

    return () => { cancelled = true; };
  }, [groupId]);

  if (error) return <ErrorState text={error} />;
  if (!data) return <LoadingState text="Inapakia deni na adhabu..." />;

  const { members, fines, debts } = data;
  const nameMap = new Map(members.map((m) => [m.userId, m.memberName]));
  const memberName = (uid: string) => nameMap.get(uid) ?? 'Mwanachama';

  const totalFinesIssued = fines.reduce((s, f) => s + f.amount, 0);
  const totalFinesPaid = fines.reduce((s, f) => s + f.amountPaid, 0);
  const totalDebts = debts.reduce((s, d) => s + d.amount, 0);
  const totalDebtsCleared = debts.reduce((s, d) => s + d.amountCleared, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ProfileCard title="Muhtasari wa Adhabu" icon={ShieldAlert} delay={0.05}>
          <dl>
            <StatRow label="Adhabu Zote Zilizotolewa">
              <Figure value={totalFinesIssued} />
            </StatRow>
            <StatRow label="Imelipwa">
              <Figure value={totalFinesPaid} />
            </StatRow>
            <StatRow label="Inasalia">
              <Figure value={totalFinesIssued - totalFinesPaid} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Muhtasari wa Deni" icon={HandCoins} delay={0.1}>
          <dl>
            <StatRow label="Madeni Yote">
              <Figure value={totalDebts} />
            </StatRow>
            <StatRow label="Imelipwa">
              <Figure value={totalDebtsCleared} />
            </StatRow>
            <StatRow label="Inasalia">
              <Figure value={totalDebts - totalDebtsCleared} />
            </StatRow>
          </dl>
        </ProfileCard>
      </div>

      <ProfileCard title="Orodha ya Adhabu" icon={ShieldAlert} delay={0.15}>
        {fines.length === 0 ? (
          <EmptyState text="Hakuna adhabu zilizotolewa kwa sasa." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Mwanachama</th>
                  <th className="px-2 py-2 font-semibold">Sababu</th>
                  <th className="px-2 py-2 font-semibold text-right">Kiasi</th>
                  <th className="px-2 py-2 font-semibold text-right">Imelipwa</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                  <th className="px-2 py-2 font-semibold">Tarehe</th>
                </tr>
              </thead>
              <tbody>
                {fines.map((f) => {
                  const fi = fineStatusInfo(f.status);
                  return (
                    <tr key={f.id} className="border-t border-ink-100">
                      <td className="px-2 py-2 text-ink-950 font-medium">{memberName(f.userId)}</td>
                      <td className="px-2 py-2 text-ink-700">
                        {fineReasonLabel(f.reasonType)}
                        {f.reason ? ` — ${f.reason}` : ''}
                      </td>
                      <td className="px-2 py-2 text-right"><Figure value={f.amount} /></td>
                      <td className="px-2 py-2 text-right"><Figure value={f.amountPaid} /></td>
                      <td className="px-2 py-2">
                        <StatusBadge label={fi.label} tone={fi.tone} />
                      </td>
                      <td className="px-2 py-2 text-ink-700">{formatDate(f.issuedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>

      <ProfileCard title="Orodha ya Deni" icon={HandCoins} delay={0.2}>
        {debts.length === 0 ? (
          <EmptyState text="Hakuna deni linalosalia kwa wanachama kwa sasa." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Mwanachama</th>
                  <th className="px-2 py-2 font-semibold">Sababu</th>
                  <th className="px-2 py-2 font-semibold text-right">Kiasi</th>
                  <th className="px-2 py-2 font-semibold text-right">Imelipwa</th>
                  <th className="px-2 py-2 font-semibold">Kipindi</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => {
                  const di = debtStatusInfo(d.status);
                  return (
                    <tr key={d.id} className="border-t border-ink-100">
                      <td className="px-2 py-2 text-ink-950 font-medium">{memberName(d.userId)}</td>
                      <td className="px-2 py-2 text-ink-700">{d.reason || '—'}</td>
                      <td className="px-2 py-2 text-right"><Figure value={d.amount} /></td>
                      <td className="px-2 py-2 text-right"><Figure value={d.amountCleared} /></td>
                      <td className="px-2 py-2 text-ink-700">{formatDate(d.period)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge label={di.label} tone={di.tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>
    </div>
  );
}

// ── 5. Uzingatiaji tab (Ukonga Rules Specification v1.2, sehemu 5/6/7/8
//      - Phase 5. Reads ONLY from ComplianceSnapshots via ComplianceReportService
//      - a pure history/trend view, separate from the real-time Defaulters
//      list already shown on Muhtasari). ────────────────────────────────

function UzingatiajiTab({ groupId }: { groupId: string }) {
  const [summary, setSummary] = useState<ComplianceSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [trend, setTrend] = useState<ComplianceTrend | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setSummary(null);
    setError(null);
    setSelectedMemberId(null);
    setTrend(null);

    getComplianceSummary(groupId)
      .then((rows) => {
        if (!cancelled) setSummary(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia muhtasari wa uzingatiaji.');
      });

    return () => { cancelled = true; };
  }, [groupId]);

  function handleSelectMember(row: ComplianceSummaryRow) {
    setSelectedMemberId(row.groupMemberId);
    setTrend(null);
    setTrendError(null);
    setTrendLoading(true);

    getComplianceTrend(groupId, row.groupMemberId)
      .then((t) => setTrend(t))
      .catch(() => setTrendError('Imeshindwa kupakia mwenendo wa mwanachama huyu.'))
      .finally(() => setTrendLoading(false));
  }

  if (error) return <ErrorState text={error} />;
  if (!summary) return <LoadingState text="Inapakia uzingatiaji..." />;

  return (
    <div className="space-y-5">
      <ProfileCard title="Muhtasari wa Uzingatiaji" icon={History} delay={0.05}>
        <p className="text-xs text-ink-500 -mt-1 mb-3">
          Toka kwenye snapshot ya mwisho ya kila mwanachama. Bofya jina kuona
          mwenendo wake wa mwezi kwa mwezi.
        </p>
        {summary.length === 0 ? (
          <EmptyState text="Hakuna taarifa za uzingatiaji bado — hakikisha ContributionComplianceBackgroundService imeshapita kwa kikundi hiki." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Mwanachama</th>
                  <th className="px-2 py-2 font-semibold text-right">Ameshakosa (Jumla)</th>
                  <th className="px-2 py-2 font-semibold text-right">Mfululizo</th>
                  <th className="px-2 py-2 font-semibold text-right">Adhabu Inayodaiwa</th>
                  <th className="px-2 py-2 font-semibold text-right">Deni la Mchango</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => {
                  const si = memberStatusInfo(row.status);
                  const isSelected = row.groupMemberId === selectedMemberId;
                  return (
                    <tr
                      key={row.groupMemberId}
                      onClick={() => handleSelectMember(row)}
                      className={`border-t border-ink-100 cursor-pointer transition-colors ${
                        isSelected ? 'bg-paper-raised' : 'hover:bg-paper'
                      }`}
                    >
                      <td className="px-2 py-2 text-ink-950 font-medium">{row.memberName}</td>
                      <td className="px-2 py-2 text-right">{row.totalMissedMonths}</td>
                      <td className="px-2 py-2 text-right">{row.consecutiveMissedMonths}</td>
                      <td className="px-2 py-2 text-right"><Figure value={row.outstandingFineAmount} /></td>
                      <td className="px-2 py-2 text-right"><Figure value={row.outstandingContributionDebt} /></td>
                      <td className="px-2 py-2">
                        <StatusBadge label={si.label} tone={si.tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>

      {selectedMemberId && (
        <ProfileCard
          title={trend ? `Mwenendo — ${trend.memberName}` : 'Mwenendo wa Mwanachama'}
          icon={LineChart}
          delay={0.1}
        >
          {trendLoading && <LoadingState text="Inapakia mwenendo..." />}
          {trendError && <ErrorState text={trendError} />}
          {trend && !trendLoading && (
            trend.trend.length === 0 ? (
              <EmptyState text="Hakuna snapshot za mwanachama huyu bado." />
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                      <th className="px-2 py-2 font-semibold">Mwezi</th>
                      <th className="px-2 py-2 font-semibold text-right">Kinachotegemewa</th>
                      <th className="px-2 py-2 font-semibold text-right">Kilicholipwa</th>
                      <th className="px-2 py-2 font-semibold text-right">Adhabu Inayodaiwa</th>
                      <th className="px-2 py-2 font-semibold text-right">Deni la Mchango</th>
                      <th className="px-2 py-2 font-semibold">Hali</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.trend.map((point) => {
                      const si = memberStatusInfo(point.status);
                      return (
                        <tr key={point.month} className="border-t border-ink-100">
                          <td className="px-2 py-2 text-ink-700">{formatDate(point.month)}</td>
                          <td className="px-2 py-2 text-right"><Figure value={point.expectedContribution} /></td>
                          <td className="px-2 py-2 text-right"><Figure value={point.paidContribution} /></td>
                          <td className="px-2 py-2 text-right"><Figure value={point.outstandingFineAmount} /></td>
                          <td className="px-2 py-2 text-right"><Figure value={point.outstandingContributionDebt} /></td>
                          <td className="px-2 py-2">
                            <StatusBadge label={si.label} tone={si.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </ProfileCard>
      )}
    </div>
  );
}

// ── 6. Matukio & Malipo tab ──────────────────────────────────────────

interface MatukioData {
  events: EventReport[];
  withdrawals: WithdrawalResponse[];
}

function MatukioTab({ groupId }: { groupId: string }) {
  const [data, setData] = useState<MatukioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setData(null);
    setError(null);

    Promise.all([getEvents(groupId), getWithdrawals(groupId)])
      .then(([events, withdrawals]) => {
        if (!cancelled) setData({ events, withdrawals });
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia matukio na malipo.');
      });

    return () => { cancelled = true; };
  }, [groupId]);

  if (error) return <ErrorState text={error} />;
  if (!data) return <LoadingState text="Inapakia matukio na malipo..." />;

  const { events, withdrawals } = data;
  const totalEventExpected = events.reduce((s, e) => s + e.totalExpected, 0);
  const totalEventCollected = events.reduce((s, e) => s + e.totalCollected, 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'Paid')
    .reduce((s, w) => s + w.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ProfileCard title="Muhtasari wa Matukio" icon={CalendarClock} delay={0.05}>
          <dl>
            <StatRow label="Matukio Yote">{events.length}</StatRow>
            <StatRow label="Yanayoendelea">
              {events.filter((e) => e.isActive && !e.isResolved).length}
            </StatRow>
            <StatRow label="Ilivyotarajiwa">
              <Figure value={totalEventExpected} />
            </StatRow>
            <StatRow label="Iliyokusanywa">
              <Figure value={totalEventCollected} />
            </StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Muhtasari wa Malipo" icon={ArrowLeftRight} delay={0.1}>
          <dl>
            <StatRow label="Malipo Yote">{withdrawals.length}</StatRow>
            <StatRow label="Yamelipwa">
              {withdrawals.filter((w) => w.status === 'Paid').length}
            </StatRow>
            <StatRow label="Kiasi Kilichotolewa">
              <Figure value={totalWithdrawn} />
            </StatRow>
            <StatRow label="Yanasubiri Idhini">
              {withdrawals.filter((w) => w.status === 'Pending').length}
            </StatRow>
          </dl>
        </ProfileCard>
      </div>

      <ProfileCard title="Matukio ya Ustawi" icon={CalendarClock} delay={0.15}>
        {events.length === 0 ? (
          <EmptyState text="Hakuna matukio yaliyosajiliwa kwa sasa." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Tukio</th>
                  <th className="px-2 py-2 font-semibold">Mpokeaji</th>
                  <th className="px-2 py-2 font-semibold text-right">Kwa Mwanachama</th>
                  <th className="px-2 py-2 font-semibold text-right">Iliyokusanywa</th>
                  <th className="px-2 py-2 font-semibold">Wanalipa</th>
                  <th className="px-2 py-2 font-semibold">Tarehe</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-ink-100">
                    <td className="px-2 py-2 text-ink-950 font-medium">{e.title}</td>
                    <td className="px-2 py-2 text-ink-700">{e.beneficiaryName || '—'}</td>
                    <td className="px-2 py-2 text-right"><Figure value={e.targetAmountPerMember} /></td>
                    <td className="px-2 py-2 text-right"><Figure value={e.totalCollected} /></td>
                    <td className="px-2 py-2 text-ink-700">
                      {e.paidCount}/{e.paidCount + e.pendingCount}
                    </td>
                    <td className="px-2 py-2 text-ink-700">{formatDate(e.eventDate)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge
                        label={e.isResolved ? 'Imekamilika' : e.isActive ? 'Inaendelea' : 'Imefungwa'}
                        tone={e.isResolved ? 'good' : e.isActive ? 'warn' : 'neutral'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>

      <ProfileCard title="Malipo Yaliyotolewa" icon={ArrowLeftRight} delay={0.2}>
        {withdrawals.length === 0 ? (
          <EmptyState text="Hakuna malipo yaliyotolewa kwa sasa." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Sababu</th>
                  <th className="px-2 py-2 font-semibold">Mpokeaji</th>
                  <th className="px-2 py-2 font-semibold text-right">Kiasi</th>
                  <th className="px-2 py-2 font-semibold">Idhini</th>
                  <th className="px-2 py-2 font-semibold">Tarehe</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => {
                  const wi = withdrawalStatusInfo(w.status);
                  return (
                    <tr key={w.id} className="border-t border-ink-100">
                      <td className="px-2 py-2 text-ink-950 font-medium">{w.purpose}</td>
                      <td className="px-2 py-2 text-ink-700">{w.beneficiaryName}</td>
                      <td className="px-2 py-2 text-right"><Figure value={w.amount} /></td>
                      <td className="px-2 py-2 text-ink-700">
                        {w.approvalsReceived}/{w.requiredApprovals}
                      </td>
                      <td className="px-2 py-2 text-ink-700">{formatDateTime(w.decisionAt ?? w.date)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge label={wi.label} tone={wi.tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProfileCard>
    </div>
  );
}

// ── 6. Shiriki tab (WhatsApp export) ─────────────────────────────────

function ShirikiTab({ groupId }: { groupId: string }) {
  const [summary, setSummary] = useState<WhatsAppSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setSummary(null);
    setError(null);

    getWhatsAppSummary(groupId)
      .then((d) => { if (!cancelled) setSummary(d); })
      .catch(() => { if (!cancelled) setError('Imeshindwa kupakia muhtasari wa WhatsApp.'); });

    return () => { cancelled = true; };
  }, [groupId]);

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.formattedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard API may not be available — show a fallback
      setError('Imeshindwa kunakili. Tafadhali nakili maneno mwenyewe.');
    }
  };

  if (error) return <ErrorState text={error} />;
  if (!summary) return <LoadingState text="Inapakia muhtasari..." />;

  return (
    <div className="space-y-5">
      <ProfileCard title="Muhtasari wa WhatsApp" icon={Share2} delay={0.05}>
        <p className="text-sm text-ink-700 mb-4">
          Ripoti hii imeandaliwa tayari kwa nakala moja unayoweza kushiriki kwenye WhatsApp au
          jukwaa lingine la ujumbe. Bonyeza "Nakili" hapo chini, kisha ushiriki kwenye kikundi
          chako.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              copied
                ? 'bg-standing-good-bg text-standing-good'
                : 'bg-ink-800 text-ink-50 hover:bg-ink-700'
            }`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Imenakiliwa!' : 'Nakili Muhtasari'}
          </button>
          <span className="text-xs text-ink-500">
            Imeandaliwa: {formatDateTime(summary.generatedAt)}
          </span>
        </div>

        <pre className="whitespace-pre-wrap font-mono text-xs text-ink-800 bg-ink-50 rounded-lg p-4 border border-ink-100 max-h-[600px] overflow-y-auto">
          {summary.formattedMessage}
        </pre>
      </ProfileCard>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export function ReportsPage() {
  const { activeGroupId, loading: groupsLoading, error: groupsError } = useMyGroups();
  const [activeTab, setActiveTab] = useState('muhtasari');

  if (groupsLoading) {
    return <LoadingState text="Inapakia makundi yako..." />;
  }

  if (groupsError) {
    return <ErrorState text={groupsError} />;
  }

  if (!activeGroupId) {
    return (
      <div className="rounded-xl bg-paper-raised border border-ink-100 px-4 py-6 text-sm text-ink-700 text-center">
        Bado hujajiunga na kikundi chochote.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'muhtasari' && <MuhtasariTab groupId={activeGroupId} />}
      {activeTab === 'wanachama' && <WanachamaTab groupId={activeGroupId} />}
      {activeTab === 'mikopo' && <MikopoTab groupId={activeGroupId} />}
      {activeTab === 'deni-faini' && <DeniFainiTab groupId={activeGroupId} />}
      {activeTab === 'uzingatiaji' && <UzingatiajiTab groupId={activeGroupId} />}
      {activeTab === 'matukio' && <MatukioTab groupId={activeGroupId} />}
      {activeTab === 'shiriki' && <ShirikiTab groupId={activeGroupId} />}
    </div>
  );
}
