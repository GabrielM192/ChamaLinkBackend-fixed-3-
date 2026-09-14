import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Landmark,
  Upload,
  ArrowLeftRight,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
  HandCoins,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useMyGroups } from '../hooks/useMyGroups';
import { MkobaUpload } from '../components/MkobaUpload';
import { Tabs, type Tab } from '../components/Tabs';
import { ProfileCard, StatRow } from '../components/ProfileCard';
import { StatusBadge } from '../components/StatusBadge';
import { Figure } from '../components/Figure';
import { loanStatusInfo, groupRoleLabel, type StatusTone } from '../lib/status';
import {
  issueLoan,
  recordLoanRepayment,
  markLoanDefaulted,
  getGroupLoans,
  type LoanResponse,
  type IssueLoanPayload,
} from '../api/loans';
import {
  createWithdrawal,
  decideWithdrawal,
  markWithdrawalPaid,
  getWithdrawals,
  getWithdrawalApprovalRule,
  type WithdrawalResponse,
  type WithdrawalApprovalRule,
  type CreateWithdrawalPayload,
} from '../api/withdrawals';
import {
  getLoanPortfolio,
  getMemberRegistry,
  type LoanPortfolio,
  type MemberRegistryRow,
} from '../api/reports';

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

const LEADER_ROLES = new Set(['Chairperson', 'Treasurer']);

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

// ── tabs ──────────────────────────────────────────────────────────────

const TABS: Tab[] = [
  { id: 'mikopo', label: 'Mikopo', icon: Landmark },
  { id: 'malipo', label: 'Malipo', icon: ArrowLeftRight },
  { id: 'pakia', label: 'Pakia M-Koba', icon: Upload },
];

// ══════════════════════════════════════════════════════════════════════
// 1. MIKOPO TAB — loan portfolio + list + issue / repay / default
// ══════════════════════════════════════════════════════════════════════

function MikopoTab({ groupId, isLeader }: { groupId: string; isLeader: boolean }) {
  const [loans, setLoans] = useState<LoanResponse[]>([]);
  const [portfolio, setPortfolio] = useState<LoanPortfolio | null>(null);
  const [members, setMembers] = useState<MemberRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getGroupLoans(groupId),
      getLoanPortfolio(groupId),
      getMemberRegistry(groupId),
    ])
      .then(([loanData, portfolioData, memberData]) => {
        if (cancelled) {
          setLoans(loanData);
          setPortfolio(portfolioData);
          setMembers(memberData);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia taarifa za mikopo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [groupId]);

  useEffect(() => {
    const cleanup = loadData();
    return cleanup;
  }, [loadData, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  if (loading) return <LoadingState text="Inapakia mikopo..." />;
  if (error) return <ErrorState text={error} />;
  if (!portfolio) return <ErrorState text="Taarifa za mikopo hazijapatikana." />;

  return (
    <div className="space-y-5">
      {/* Portfolio summary */}
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

        <ProfileCard title="Hali ya Mikopo" icon={CheckCircle2} delay={0.1}>
          <dl>
            <StatRow label="Inayoendelea">{portfolio.activeLoansCount}</StatRow>
            <StatRow label="Imelipwa Kamili">{portfolio.repaidLoansCount}</StatRow>
            <StatRow label="Imechelewa">{portfolio.overdueLoansCount}</StatRow>
            <StatRow label="Imeshindwa Kulipwa">{portfolio.defaultedLoansCount}</StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Hatari za Mikopo" icon={AlertCircle} delay={0.15}>
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

      {/* Issue loan button (leader only) */}
      {isLeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wide">
            Orodha ya Mikopo
          </h3>
          <button
            onClick={() => setShowIssueForm((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 text-ink-50 px-3 py-1.5 text-sm font-medium hover:bg-ink-700 transition-colors"
          >
            <Plus size={16} />
            {showIssueForm ? 'Funga Fomu' : 'Toa Mkopo'}
          </button>
        </div>
      )}

      {/* Issue loan form */}
      {isLeader && showIssueForm && (
        <IssueLoanForm
          groupId={groupId}
          members={members}
          onSuccess={() => {
            setShowIssueForm(false);
            refresh();
          }}
        />
      )}

      {/* Loan list */}
      {loans.length === 0 ? (
        <ProfileCard title="Orodha ya Mikopo" icon={Landmark} delay={0.2}>
          <EmptyState text="Hakuna mikopo inayoendelea kwa sasa." />
        </ProfileCard>
      ) : (
        <ProfileCard title="Orodha ya Mikopo" icon={Landmark} delay={0.2}>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-600 uppercase tracking-wide">
                  <th className="px-2 py-2 font-semibold">Mwanachama</th>
                  <th className="px-2 py-2 font-semibold text-right">Kiasi</th>
                  <th className="px-2 py-2 font-semibold text-right">Riba</th>
                  <th className="px-2 py-2 font-semibold text-right">Deni</th>
                  <th className="px-2 py-2 font-semibold text-right">Imelipwa</th>
                  <th className="px-2 py-2 font-semibold">Muda</th>
                  <th className="px-2 py-2 font-semibold">Hali</th>
                  {isLeader && <th className="px-2 py-2 font-semibold">Matendo</th>}
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const info = loanStatusInfo(loan.status, loan.isOverdue);
                  return (
                    <LoanRow
                      key={loan.id}
                      loan={loan}
                      isLeader={isLeader}
                      info={info}
                      onAction={refresh}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </ProfileCard>
      )}
    </div>
  );
}

// ── Issue loan form ───────────────────────────────────────────────────

function IssueLoanForm({
  groupId,
  members,
  onSuccess,
}: {
  groupId: string;
  members: MemberRegistryRow[];
  onSuccess: () => void;
}) {
  const [groupMemberId, setGroupMemberId] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestRateOverride, setInterestRateOverride] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleMembers = members.filter(
    (m) => m.status === 'Active' || m.status === 'Warning'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupMemberId || !principalAmount) {
      setError('Tafadhali chagua mwanachama na weka kiasi.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: IssueLoanPayload = {
      groupMemberId,
      principalAmount: parseFloat(principalAmount),
      interestRateOverride: interestRateOverride
        ? parseFloat(interestRateOverride)
        : null,
      dueDate: dueDate || null,
      purpose: purpose || null,
    };

    try {
      await issueLoan(groupId, payload);
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kutoa mkopo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border border-ink-100 rounded-xl bg-paper-raised p-6 overflow-hidden"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900 uppercase tracking-wide mb-4">
        <HandCoins size={16} className="text-ink-600" />
        Toa Mkopo Mpya
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-600 mb-1">Mwanachama</label>
            <select
              value={groupMemberId}
              onChange={(e) => setGroupMemberId(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            >
              <option value="">— Chagua —</option>
              {eligibleMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.memberNumber})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">Kiasi (TSH)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              placeholder="50000"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">
              Riba % (acha wazi kwa chaguo-msingi)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={interestRateOverride}
              onChange={(e) => setInterestRateOverride(e.target.value)}
              placeholder="acha wazi"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">
              Tarehe ya Kurudisha (acha wazi kwa default)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-ink-600 mb-1">Sababu ya Mkopo</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Biashara, Mahitaji, nk."
            className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-900 text-ink-50 font-medium px-5 py-2.5 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? 'Inahifadhi...' : 'Hifadhi Mkopo'}
          </button>
          <button
            type="button"
            onClick={() => {
              setGroupMemberId('');
              setPrincipalAmount('');
              setInterestRateOverride('');
              setDueDate('');
              setPurpose('');
              setError(null);
            }}
            className="rounded-lg px-4 py-2.5 text-sm text-ink-600 hover:text-ink-950 transition-colors"
          >
            Futa
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Loan row with inline actions ──────────────────────────────────────

function LoanRow({
  loan,
  isLeader,
  info,
  onAction,
}: {
  loan: LoanResponse;
  isLeader: boolean;
  info: { label: string; tone: StatusTone };
  onAction: () => void;
}) {
  const [showRepayForm, setShowRepayForm] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayRef, setRepayRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRepay = isLeader && loan.status === 'Active' && loan.outstandingBalance > 0;
  const canDefault = isLeader && loan.status === 'Active';

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) {
      setError('Kiasi lazima kiwe zaidi ya sifuri.');
      return;
    }
    if (amount > loan.outstandingBalance) {
      setError(`Kiasi kimezidi deni lililobaki (TSH ${loan.outstandingBalance.toLocaleString()}).`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await recordLoanRepayment(loan.id, {
        amount,
        referenceNo: repayRef || null,
      });
      setShowRepayForm(false);
      setRepayAmount('');
      setRepayRef('');
      onAction();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kurekodi malipo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDefault = async () => {
    if (!confirm('Una uhakika unataka kuweka mkopo huu kama umeshindwa kulipwa?')) return;
    setLoading(true);
    setError(null);
    try {
      await markLoanDefaulted(loan.id);
      onAction();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kuweka mkopo kama umeshindwa kulipwa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <tr className="border-t border-ink-100">
        <td className="px-2 py-2 text-ink-950 font-medium">
          {loan.memberName ?? 'Mwanachama'}
          {loan.purpose && (
            <span className="block text-xs text-ink-500">{loan.purpose}</span>
          )}
        </td>
        <td className="px-2 py-2 text-right"><Figure value={loan.principalAmount} /></td>
        <td className="px-2 py-2 text-right text-ink-700">
          {loan.interestRate.toFixed(1)}%
        </td>
        <td className="px-2 py-2 text-right"><Figure value={loan.outstandingBalance} /></td>
        <td className="px-2 py-2 text-right"><Figure value={loan.amountRepaid} /></td>
        <td className="px-2 py-2 text-ink-700">{formatDate(loan.dueDate)}</td>
        <td className="px-2 py-2">
          <StatusBadge label={info.label} tone={info.tone} />
        </td>
        {isLeader && (
          <td className="px-2 py-2">
            <div className="flex items-center gap-1.5">
              {canRepay && (
                <button
                  onClick={() => setShowRepayForm((s) => !s)}
                  className="inline-flex items-center gap-1 rounded-md bg-ink-100 text-ink-700 px-2 py-1 text-xs font-medium hover:bg-ink-200/70 transition-colors"
                >
                  <HandCoins size={13} /> Lipa
                </button>
              )}
              {canDefault && (
                <button
                  onClick={handleDefault}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md bg-standing-overdue-bg text-standing-overdue px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  <X size={13} /> Shindwa
                </button>
              )}
              {loan.status !== 'Active' && (
                <span className="text-xs text-ink-400">—</span>
              )}
            </div>
          </td>
        )}
      </tr>
      {showRepayForm && canRepay && (
        <tr className="bg-ink-50">
          <td colSpan={isLeader ? 8 : 7} className="px-4 py-3">
            <form onSubmit={handleRepay} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-ink-600 mb-0.5">Kiasi (TSH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder={loan.outstandingBalance.toString()}
                  className="rounded-lg border border-ink-200 bg-paper px-3 py-1.5 text-sm w-32 focus:border-ink-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-600 mb-0.5">Namba ya Mpokeaji</label>
                <input
                  type="text"
                  value={repayRef}
                  onChange={(e) => setRepayRef(e.target.value)}
                  placeholder="Ref (hiari)"
                  className="rounded-lg border border-ink-200 bg-paper px-3 py-1.5 text-sm w-40 focus:border-ink-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 text-ink-50 px-4 py-1.5 text-sm font-medium hover:bg-ink-800 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Thibitisha Malipo
              </button>
              <button
                type="button"
                onClick={() => { setShowRepayForm(false); setError(null); }}
                className="text-sm text-ink-600 hover:text-ink-950"
              >
                Funga
              </button>
              {error && (
                <span className="text-xs text-standing-overdue">{error}</span>
              )}
            </form>
          </td>
        </tr>
      )}
      {error && !showRepayForm && (
        <tr>
          <td colSpan={isLeader ? 8 : 7} className="px-2 py-1">
            <span className="text-xs text-standing-overdue">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 2. MALIPO TAB — withdrawal create / approve / mark-paid
// ══════════════════════════════════════════════════════════════════════

function MalipoTab({ groupId, isLeader }: { groupId: string; isLeader: boolean }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalResponse[]>([]);
  const [rule, setRule] = useState<WithdrawalApprovalRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getWithdrawals(groupId),
      getWithdrawalApprovalRule(groupId),
    ])
      .then(([w, r]) => {
        if (!cancelled) {
          setWithdrawals(w);
          setRule(r);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia taarifa za malipo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [groupId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  if (loading) return <LoadingState text="Inapakia malipo..." />;
  if (error) return <ErrorState text={error} />;

  const pending = withdrawals.filter((w) => w.status === 'Pending').length;
  const paid = withdrawals.filter((w) => w.status === 'Paid').length;
  const totalPaid = withdrawals
    .filter((w) => w.status === 'Paid')
    .reduce((s, w) => s + w.amount, 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <ProfileCard title="Muhtasari wa Malipo" icon={ArrowLeftRight} delay={0.05}>
          <dl>
            <StatRow label="Malipo Yote">{withdrawals.length}</StatRow>
            <StatRow label="Yanasubiri Idhini">{pending}</StatRow>
            <StatRow label="Yamelipwa">{paid}</StatRow>
          </dl>
        </ProfileCard>

        <ProfileCard title="Fedha Zilizotolewa" icon={HandCoins} delay={0.1}>
          <dl>
            <StatRow label="Jumla Iliyolipwa">
              <Figure value={totalPaid} />
            </StatRow>
          </dl>
        </ProfileCard>

        {rule && (
          <ProfileCard title="Kanuni za Idhini" icon={Clock} delay={0.15}>
            <dl>
              <StatRow label="Idhini Zinazohitajika">
                {rule.requiredApprovals}
              </StatRow>
              <StatRow label="Wanaoidhinisha">
                {rule.allowedRoles.map((r) => groupRoleLabel(r)).join(', ')}
              </StatRow>
            </dl>
          </ProfileCard>
        )}
      </div>

      {/* Create withdrawal button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wide">
          Orodha ya Malipo
        </h3>
        <button
          onClick={() => setShowCreateForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 text-ink-50 px-3 py-1.5 text-sm font-medium hover:bg-ink-700 transition-colors"
        >
          <Plus size={16} />
          {showCreateForm ? 'Funga Fomu' : 'Omba Malipo'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateWithdrawalForm
          groupId={groupId}
          onSuccess={() => {
            setShowCreateForm(false);
            refresh();
          }}
        />
      )}

      {/* Withdrawal list */}
      {withdrawals.length === 0 ? (
        <ProfileCard title="Malipo Yaliyotolewa" icon={ArrowLeftRight} delay={0.2}>
          <EmptyState text="Hakuna malipo yaliyoombwa kwa sasa." />
        </ProfileCard>
      ) : (
        <ProfileCard title="Malipo Yaliyotolewa" icon={ArrowLeftRight} delay={0.2}>
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
                  {isLeader && <th className="px-2 py-2 font-semibold">Matendo</th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <WithdrawalRow
                    key={w.id}
                    withdrawal={w}
                    isLeader={isLeader}
                    onAction={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </ProfileCard>
      )}
    </div>
  );
}

// ── Create withdrawal form ────────────────────────────────────────────

function CreateWithdrawalForm({
  groupId,
  onSuccess,
}: {
  groupId: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !purpose || !beneficiaryName) {
      setError('Tafadhali jaza kiasi, sababu na jina la mpokeaji.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CreateWithdrawalPayload = {
      groupId,
      amount: parseFloat(amount),
      purpose,
      beneficiaryName,
      referenceNo: referenceNo || null,
      notes: notes || null,
    };

    try {
      await createWithdrawal(payload);
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kuomba malipo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border border-ink-100 rounded-xl bg-paper-raised p-6 overflow-hidden"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900 uppercase tracking-wide mb-4">
        <ArrowLeftRight size={16} className="text-ink-600" />
        Omba Malipo
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-600 mb-1">Kiasi (TSH)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">Jina la Mpokeaji</label>
            <input
              type="text"
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Jina kamili"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-ink-600 mb-1">Sababu ya Kutoa Fedha</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Maelezo ya malipo"
            className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-600 mb-1">Namba ya Mpokeaji (hiari)</label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="Ref"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">Maelezo Zaidi (hiari)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-950 focus:border-ink-400 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-900 text-ink-50 font-medium px-5 py-2.5 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {loading ? 'Inahifadhi...' : 'Wasilisha Ombi'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAmount('');
              setPurpose('');
              setBeneficiaryName('');
              setReferenceNo('');
              setNotes('');
              setError(null);
            }}
            className="rounded-lg px-4 py-2.5 text-sm text-ink-600 hover:text-ink-950 transition-colors"
          >
            Futa
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Withdrawal row with inline actions ────────────────────────────────

function WithdrawalRow({
  withdrawal,
  isLeader,
  onAction,
}: {
  withdrawal: WithdrawalResponse;
  isLeader: boolean;
  onAction: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDecide = isLeader && withdrawal.status === 'Pending';
  const canMarkPaid = isLeader && withdrawal.status === 'Approved';

  const handleDecide = async (approve: boolean) => {
    if (approve && !reason && withdrawal.requiredApprovals > 1) {
      // Multi-approval: reason optional; single approval: also optional
    }
    setLoading(true);
    setError(null);
    try {
      await decideWithdrawal(withdrawal.id, {
        approve,
        reason: reason || null,
      });
      setReason('');
      onAction();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kutoa uamuzi.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!confirm('Thibitisha kwamba malipo yametolewa kwa mpokeaji?')) return;
    setLoading(true);
    setError(null);
    try {
      await markWithdrawalPaid(withdrawal.id);
      onAction();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imeshindwa kuweka kama imelipwa.');
    } finally {
      setLoading(false);
    }
  };

  const wi = withdrawalStatusInfo(withdrawal.status);

  return (
    <>
      <tr className="border-t border-ink-100">
        <td className="px-2 py-2 text-ink-950 font-medium">
          {withdrawal.purpose}
          {withdrawal.referenceNo && (
            <span className="block text-xs text-ink-500">Ref: {withdrawal.referenceNo}</span>
          )}
        </td>
        <td className="px-2 py-2 text-ink-700">{withdrawal.beneficiaryName}</td>
        <td className="px-2 py-2 text-right"><Figure value={withdrawal.amount} /></td>
        <td className="px-2 py-2 text-ink-700">
          {withdrawal.approvalsReceived}/{withdrawal.requiredApprovals}
        </td>
        <td className="px-2 py-2 text-ink-700">
          {formatDateTime(withdrawal.decisionAt ?? withdrawal.date)}
        </td>
        <td className="px-2 py-2">
          <StatusBadge label={wi.label} tone={wi.tone} />
        </td>
        {isLeader && (
          <td className="px-2 py-2">
            <div className="flex items-center gap-1.5">
              {canDecide && (
                <>
                  <button
                    onClick={() => handleDecide(true)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded-md bg-standing-good-bg text-standing-good px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                  >
                    <Check size={13} /> Itia
                  </button>
                  <button
                    onClick={() => handleDecide(false)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded-md bg-standing-overdue-bg text-standing-overdue px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                  >
                    <X size={13} /> Kata
                  </button>
                </>
              )}
              {canMarkPaid && (
                <button
                  onClick={handleMarkPaid}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md bg-standing-good-bg text-standing-good px-2 py-1 text-xs font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  <CheckCircle2 size={13} /> Lipa
                </button>
              )}
              {!canDecide && !canMarkPaid && (
                <span className="text-xs text-ink-400">—</span>
              )}
            </div>
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={isLeader ? 7 : 6} className="px-2 py-1">
            <span className="text-xs text-standing-overdue">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 3. PAKIA M-KOBA TAB — existing upload component
// ══════════════════════════════════════════════════════════════════════

function PakiaTab({ groupId }: { groupId: string }) {
  return (
    <div className="max-w-md">
      <MkobaUpload groupId={groupId} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Main MkobaPage — tabbed financial operations center for leaders
// ══════════════════════════════════════════════════════════════════════

export function MkobaPage() {
  const { activeGroupId, loading, error, activeGroup } = useMyGroups();
  const [activeTab, setActiveTab] = useState('mikopo');

  // Check the user's role in the currently active group — only
  // Chairperson/Treasurer can issue loans, approve withdrawals, etc.
  // Members can still view loans and withdrawals (read-only), and
  // create withdrawal requests of their own.
  const isLeader = LEADER_ROLES.has(activeGroup?.role ?? '');

  if (loading) {
    return <LoadingState text="Inapakia makundi yako..." />;
  }

  if (error) {
    return <ErrorState text={error} />;
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

      {activeTab === 'mikopo' && (
        <MikopoTab groupId={activeGroupId} isLeader={isLeader} />
      )}
      {activeTab === 'malipo' && (
        <MalipoTab groupId={activeGroupId} isLeader={isLeader} />
      )}
      {activeTab === 'pakia' && <PakiaTab groupId={activeGroupId} />}
    </div>
  );
}
