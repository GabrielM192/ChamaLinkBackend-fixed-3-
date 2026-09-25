import React from 'react';
import { Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { useMyGroups } from '../hooks/useMyGroups';
import { TreasuryUpload } from '../components/TreasuryUpload';
import { getMemberRegistry, type MemberRegistryRow } from '../api/reports';

// Leader-only "Treasury Excel Import" page. Sits next to the M-Koba
// import as a leader's tool: it takes a treasurer's monthly ledger Excel
// and posts back-dated LedgerEntries (Contribution + Fine + Savings +
// JoiningFee) to record the historical truth without re-triggering the
// M-Koba waterfall (auto-fine, account-routing, etc). The actual
// matching / splitting logic lives in the backend (TreasuryImportService);
// this page just uploads and lets the treasurer approve the preview.
export function TreasuryPage() {
  const { activeGroupId, activeGroup, loading: groupsLoading } = useMyGroups();

  const [members, setMembers] = React.useState<MemberRegistryRow[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(false);
  const [membersError, setMembersError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeGroupId) return;
    let cancelled = false;
    setLoadingMembers(true);
    setMembersError(null);
    getMemberRegistry(activeGroupId)
      .then((rows) => { if (!cancelled) setMembers(rows); })
      .catch(() => {
        if (!cancelled) setMembersError('Imeshindwa kupakia orodha ya wanachama wa kikundi.');
      })
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [activeGroupId]);

  if (groupsLoading) {
    return (
      <div className="flex items-center gap-2 text-ink-700">
        <Loader2 size={18} className="animate-spin" /> Inapakia taarifa za kikundi...
      </div>
    );
  }

  if (!activeGroupId) {
    return (
      <div className="rounded-xl border border-ink-100 bg-paper-raised p-6 text-ink-700">
        Hakuna kikundi kilichochaguliwa. Tafadhali chagua kikundi kwenye menyu ya juu.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950 flex items-center gap-2">
          <FileSpreadsheet size={22} className="text-gold-600" />
          Hazina — Import ya Kihistoria
        </h1>
        <p className="text-sm text-ink-700 mt-1">
          Kikundi: <span className="font-medium text-ink-950">{activeGroup?.groupName ?? '—'}</span>.
          {' '}Pakia jedwali la mtunza-hazina (mwezi-na-mwanachama) ili kuhamisha historia kwenye mfumo.
        </p>
      </div>

      {membersError && (
        <div className="flex items-start gap-2 text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
          <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{membersError}</span>
        </div>
      )}

      {loadingMembers ? (
        <div className="flex items-center gap-2 text-ink-700 text-sm">
          <Loader2 size={16} className="animate-spin" /> Inapakia orodha ya wanachama...
        </div>
      ) : (
        <TreasuryUpload
          groupId={activeGroupId}
          groupName={activeGroup?.groupName ?? '—'}
          members={members}
        />
      )}
    </div>
  );
}