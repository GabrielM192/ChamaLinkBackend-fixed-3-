import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PiggyBank,
  Percent,
  Wallet,
  HeartHandshake,
  AlertTriangle,
  Loader2,
  Save,
  CheckCircle,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useMyGroups } from '../hooks/useMyGroups';
import {
  getGroupSettings,
  updateGroupSettings,
  type GroupSettings,
  type UpdateGroupSettingsDto,
} from '../api/settings';
import { ProfileCard } from '../components/ProfileCard';
import { groupRoleLabel } from '../lib/status';

// A7 — Group Settings page. The single place where a Chairperson
// configures the group's financial rules: monthly contribution target,
// due date, grace period, fines, loan interest, joining fee, welfare
// mode. Every other screen depends on these values being correct —
// Collection Rate, Compliance, and the import waterfall all read
// MonthlyContribution from here, so if it is 0 everything downstream
// is silently broken (A7 root cause).

const WELFARE_MODE_OPTIONS = [
  { value: 'DeductBalance', label: 'Punguza kwenye Salio la Mwanachama' },
  { value: 'ContributePot', label: 'Mchango wa Lazima kwenye Sanduku' },
];

// Ukonga Rules Specification v1.2, sehemu 4b (ARCH-001) - maelezo haya ni
// tafsiri ya moja kwa moja ya jedwali la sehemu 4b, si maneno mapya.
const DEBT_ALLOCATION_STRATEGY_OPTIONS = [
  {
    value: 'CurrentMonthFirst',
    label: 'Mwezi wa Sasa Kwanza',
    hint: 'Malipo mapya yanahesabiwa kama mchango wa mwezi wa sasa kwanza. Madeni ya zamani yanabaki bila kuguswa mpaka mtu alipe ziada mahususi.',
  },
  {
    value: 'OldestDebtFirst',
    label: 'Deni la Zamani Kwanza',
    hint: 'Malipo mapya yanafunga deni la zamani zaidi kwanza, kisha ziada (kama ipo) inahesabiwa kama mchango wa mwezi wa sasa.',
  },
  {
    value: 'ManualAllocation',
    label: 'Ugawaji wa Mkono',
    hint: 'Mtunza Hazina anachagua mwenyewe malipo yanafunga mwezi/deni gani wakati wa kurekodi.',
  },
];

const DUE_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function moneyInputClass(canEdit: boolean): string {
  return `w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 figure tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 transition-colors ${
    canEdit ? '' : 'bg-paper cursor-not-allowed opacity-70'
  }`;
}

function selectClass(canEdit: boolean): string {
  return `w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 transition-colors ${
    canEdit ? '' : 'bg-paper cursor-not-allowed opacity-70'
  }`;
}

const LABEL_CLASS = 'block text-xs font-medium text-ink-700 mb-1';
const HINT_CLASS = 'text-xs text-ink-500 mt-0.5';

export function SettingsPage() {
  const { activeGroupId, activeGroup, loading: groupsLoading, error: groupsError } = useMyGroups();
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state — local editable copy, diffed against `settings` on save
  // so only changed fields are sent (the backend DTO is all-optional).
  const [form, setForm] = useState<GroupSettings | null>(null);

  const isChairperson = activeGroup?.role === 'Chairperson';
  const canEdit = isChairperson;

  useEffect(() => {
    if (!activeGroupId) return;
    let cancelled = false;

    setSettings(null);
    setForm(null);
    setError(null);
    setSaved(false);

    getGroupSettings(activeGroupId)
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setForm(s);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Imeshindwa kupakia mipangilio ya kikundi.');
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroupId]);

  function updateForm<K extends keyof GroupSettings>(key: K, value: GroupSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  function handleSave() {
    if (!activeGroupId || !form || !settings) return;

    // Diff — only send fields that actually changed.
    const dto: UpdateGroupSettingsDto = {};
    if (form.monthlyContribution !== settings.monthlyContribution)
      dto.monthlyContribution = form.monthlyContribution;
    if (form.lateFine !== settings.lateFine) dto.lateFine = form.lateFine;
    if (form.loanInterestRate !== settings.loanInterestRate)
      dto.loanInterestRate = form.loanInterestRate;
    if (form.dueDateDay !== settings.dueDateDay) dto.dueDateDay = form.dueDateDay;
    if (form.gracePeriodDays !== settings.gracePeriodDays)
      dto.gracePeriodDays = form.gracePeriodDays;
    if (form.joiningFee !== settings.joiningFee) dto.joiningFee = form.joiningFee;
    if (form.minimumReserveBalance !== settings.minimumReserveBalance)
      dto.minimumReserveBalance = form.minimumReserveBalance;
    if (form.minimumShortfallForFine !== settings.minimumShortfallForFine)
      dto.minimumShortfallForFine = form.minimumShortfallForFine;
    if (form.welfareMode !== settings.welfareMode) dto.welfareMode = form.welfareMode;
    if (form.maxConsecutiveMissedMonths !== settings.maxConsecutiveMissedMonths)
      dto.maxConsecutiveMissedMonths = form.maxConsecutiveMissedMonths;
    if (form.debtAllocationStrategy !== settings.debtAllocationStrategy)
      dto.debtAllocationStrategy = form.debtAllocationStrategy;

    if (Object.keys(dto).length === 0) return;

    setSaving(true);
    setSaved(false);
    updateGroupSettings(activeGroupId, dto)
      .then((updated) => {
        setSettings(updated);
        setForm(updated);
        setSaving(false);
        setSaved(true);
      })
      .catch(() => {
        setSaving(false);
        setError('Imeshindwa kuhifadhi mabadiliko. Jaribu tena.');
      });
  }

  // -- Loading / error / empty guards (same pattern as ReportsPage) ----

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

  if (error && !settings) {
    return (
      <div className="rounded-xl bg-standing-overdue-bg text-standing-overdue px-4 py-3 text-sm">
        {error}
      </div>
    );
  }

  if (!settings || !form) {
    return (
      <div className="flex items-center gap-2 text-ink-600 text-sm py-12 justify-center">
        <Loader2 size={18} className="animate-spin" />
        Inapakia mipangilio ya kikundi...
      </div>
    );
  }

  const needsSetup = settings.monthlyContribution <= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border border-ink-100 rounded-xl bg-paper-raised p-6"
      >
        <h1 className="text-xl font-semibold text-ink-950">Mipangilio ya Kikundi</h1>
        <p className="text-sm text-ink-700 mt-0.5">
          {activeGroup?.groupName ?? 'Kikundi'} ·{' '}
          {activeGroup ? groupRoleLabel(activeGroup.role) : 'Mwanachama'}
        </p>
      </motion.div>

      {/* A7 warning: MonthlyContribution = 0 is the root cause of broken
          Collection Rate, Compliance, and misclassified import entries. */}
      {needsSetup && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-xl bg-standing-warn-bg text-standing-warn px-4 py-4 flex items-start gap-3"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Mchango wa kila mwezi bado haujawekwa!</p>
            <p className="mt-1">
              Bila kiasi hiki, Collection Rate, Compliance, na mgawanyiko wa
              michango ya M-Koba haziwezi kuhesabika sawa. Washa kiasi cha
              mchango hapa chini, kisha pakia tena taarifa ya M-Koba ili
              data yote iingie sawa.
            </p>
          </div>
        </motion.div>
      )}

      {/* Read-only notice for non-Chairperson */}
      {!canEdit && (
        <div className="rounded-xl bg-ink-100 text-ink-700 px-4 py-3 text-sm flex items-center gap-2">
          <Lock size={16} />
          Mipangilio inaweza kubadilishwa na Mwenyekiti tu. Wewe ni{' '}
          {activeGroup ? groupRoleLabel(activeGroup.role) : 'Mwanachama'}.
        </div>
      )}

      {/* Section: Michango (Contributions) */}
      <ProfileCard title="Michango" icon={PiggyBank} delay={0.1}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="monthlyContribution">
              Mchango wa Kila Mwezi (TZS)
            </label>
            <input
              id="monthlyContribution"
              type="number"
              min={0}
              step={1000}
              value={form.monthlyContribution || ''}
              disabled={!canEdit}
              onChange={(e) => updateForm('monthlyContribution', parseFloat(e.target.value) || 0)}
              className={moneyInputClass(canEdit)}
              placeholder="mf. 10000"
            />
            <p className={HINT_CLASS}>
              Kiasi cha chini ambacho kila mwanachama anatakiwa kulipa kila mwezi.
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="dueDateDay">
              Siku ya Malipo (1-28)
            </label>
            <select
              id="dueDateDay"
              value={form.dueDateDay}
              disabled={!canEdit}
              onChange={(e) => updateForm('dueDateDay', parseInt(e.target.value, 10))}
              className={selectClass(canEdit)}
            >
              {DUE_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Siku ya {d}
                </option>
              ))}
            </select>
            <p className={HINT_CLASS}>Siku ya mwezi ambapo mchango unapaswa kulipwa.</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="gracePeriodDays">
              Siku za Neema (0-90)
            </label>
            <input
              id="gracePeriodDays"
              type="number"
              min={0}
              max={90}
              value={form.gracePeriodDays}
              disabled={!canEdit}
              onChange={(e) =>
                updateForm('gracePeriodDays', parseInt(e.target.value, 10) || 0)
              }
              className={moneyInputClass(canEdit)}
            />
            <p className={HINT_CLASS}>
              Baada ya siku hizi bila malipo, deni na faini huanza kuhesabika.
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="lateFine">
              Faini ya Kuchelewa (TZS)
            </label>
            <input
              id="lateFine"
              type="number"
              min={0}
              step={500}
              value={form.lateFine || ''}
              disabled={!canEdit}
              onChange={(e) => updateForm('lateFine', parseFloat(e.target.value) || 0)}
              className={moneyInputClass(canEdit)}
              placeholder="mf. 2000"
            />
            <p className={HINT_CLASS}>Faini inayotolewa kwa kuchelewa kulipa mchango.</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="minimumShortfallForFine">
              Msamaha wa Faini (TZS)
            </label>
            <input
              id="minimumShortfallForFine"
              type="number"
              min={0}
              step={500}
              value={form.minimumShortfallForFine || ''}
              disabled={!canEdit}
              onChange={(e) =>
                updateForm('minimumShortfallForFine', parseFloat(e.target.value) || 0)
              }
              className={moneyInputClass(canEdit)}
              placeholder="mf. 0"
            />
            <p className={HINT_CLASS}>
              Deni dogo kuliko hili haliweki faini (ni msamaha). Sifuri = hakuna msamaha.
            </p>
          </div>
        </div>
      </ProfileCard>

      {/* Section: Mikopo (Loans) */}
      <ProfileCard title="Mikopo" icon={Percent} delay={0.15}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="loanInterestRate">
              Riba ya Mkopo (%)
            </label>
            <input
              id="loanInterestRate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.loanInterestRate || ''}
              disabled={!canEdit}
              onChange={(e) =>
                updateForm('loanInterestRate', parseFloat(e.target.value) || 0)
              }
              className={moneyInputClass(canEdit)}
              placeholder="mf. 10"
            />
            <p className={HINT_CLASS}>Riba inayotolewa kwa mikopo ya kikundi.</p>
          </div>
        </div>
      </ProfileCard>

      {/* Section: Fedha (Financial) */}
      <ProfileCard title="Fedha" icon={Wallet} delay={0.2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="joiningFee">
              Ada ya Kujiunga (TZS)
            </label>
            <input
              id="joiningFee"
              type="number"
              min={0}
              step={1000}
              value={form.joiningFee || ''}
              disabled={!canEdit}
              onChange={(e) => updateForm('joiningFee', parseFloat(e.target.value) || 0)}
              className={moneyInputClass(canEdit)}
              placeholder="mf. 5000"
            />
            <p className={HINT_CLASS}>Ada inayolipwa mara moja wakati wa kujiunga.</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="minimumReserveBalance">
              Salio la Chini la Akiba (TZS)
            </label>
            <input
              id="minimumReserveBalance"
              type="number"
              min={0}
              step={1000}
              value={form.minimumReserveBalance || ''}
              disabled={!canEdit}
              onChange={(e) =>
                updateForm('minimumReserveBalance', parseFloat(e.target.value) || 0)
              }
              className={moneyInputClass(canEdit)}
              placeholder="mf. 0"
            />
            <p className={HINT_CLASS}>
              Salio la chini ambalo mwanachama hawezi kutoa kwenye akaunti yake.
            </p>
          </div>
        </div>
      </ProfileCard>

      {/* Section: Uzingatiaji (Compliance - Ukonga Rules Specification
          v1.2, sehemu 3/4b/ARCH-001) */}
      <ProfileCard title="Uzingatiaji" icon={ShieldCheck} delay={0.22}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="maxConsecutiveMissedMonths">
              Miezi Mfululizo Kabla ya NonActive (1-24)
            </label>
            <input
              id="maxConsecutiveMissedMonths"
              type="number"
              min={1}
              max={24}
              value={form.maxConsecutiveMissedMonths || ''}
              disabled={!canEdit}
              onChange={(e) =>
                updateForm('maxConsecutiveMissedMonths', parseInt(e.target.value, 10) || 1)
              }
              className={moneyInputClass(canEdit)}
              placeholder="mf. 3"
            />
            <p className={HINT_CLASS}>
              Mwanachama akikosa michango kwa miezi mfululizo idadi hii, Status yake
              inakuwa NonActive na inasubiri uamuzi wa uongozi (haifanyiki kiotomatiki).
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="debtAllocationStrategy">
              Ugawaji wa Malipo Mapya (Deni la Zamani)
            </label>
            <select
              id="debtAllocationStrategy"
              value={form.debtAllocationStrategy}
              disabled={!canEdit}
              onChange={(e) => updateForm('debtAllocationStrategy', e.target.value)}
              className={selectClass(canEdit)}
            >
              {DEBT_ALLOCATION_STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={HINT_CLASS}>
              {
                DEBT_ALLOCATION_STRATEGY_OPTIONS.find(
                  (opt) => opt.value === form.debtAllocationStrategy
                )?.hint
              }
            </p>
          </div>
        </div>
      </ProfileCard>

      {/* Section: Ustawi (Welfare) */}
      <ProfileCard title="Ustawi" icon={HeartHandshake} delay={0.25}>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="welfareMode">
              Mfumo wa Ustawi
            </label>
            <select
              id="welfareMode"
              value={form.welfareMode}
              disabled={!canEdit}
              onChange={(e) => updateForm('welfareMode', e.target.value)}
              className={selectClass(canEdit)}
            >
              {WELFARE_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={HINT_CLASS}>
              <strong>Punguza kwenye Salio</strong>: mchango wa ustawi unapunguzwa kwenye
              salio la mwanachama. <strong>Mchango wa Lazima</strong>: kila mwanachama
              analazimishwa kuchangia kwenye sanduku la pamoja.
            </p>
          </div>
        </div>
      </ProfileCard>

      {/* Save bar — only for Chairperson */}
      {canEdit && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="flex items-center gap-3 sticky bottom-4"
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-ink-50 hover:bg-ink-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saved ? (
              <CheckCircle size={16} className="text-standing-good" />
            ) : (
              <Save size={16} />
            )}
            {saving ? 'Inahifadhi...' : saved ? 'Imehifadhiwa' : 'Hifadhi Mabadiliko'}
          </button>
          {saved && (
            <span className="text-sm text-standing-good">
              Mabadiliko yamehifadhiwa kikamilifu.
            </span>
          )}
          {error && settings && (
            <span className="text-sm text-standing-overdue">{error}</span>
          )}
        </motion.div>
      )}
    </div>
  );
}
