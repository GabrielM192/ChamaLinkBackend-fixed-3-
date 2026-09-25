import React, { useMemo, useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, FileSpreadsheet, Sparkles } from 'lucide-react';
import {
  previewTreasuryExcel,
  commitTreasuryExcel,
  type TreasuryImportPreviewDto,
  type TreasuryImportResultDto,
  type TreasuryImportPreviewRowDto,
} from '../api/treasury';
import type { MemberRegistryRow } from '../api/reports';

interface Props {
  groupId: string;
  groupName: string;          // passed in from TreasuryPage (active group)
  members: MemberRegistryRow[]; // for override dropdowns
}

// ── helpers ──────────────────────────────────────────────────────────

function money(value: number): string {
  return `TSH ${value.toLocaleString()}`;
}

// Compute a frontend-only "matchStatus" from isExactMatch + matchConfidence,
// because the backend's preview doesn't return that string itself.
type MatchStatus = 'Exact' | 'Fuzzy' | 'Unmatched';
function matchStatusOf(row: TreasuryImportPreviewRowDto): MatchStatus {
  if (row.isExactMatch) return 'Exact';
  if (row.matchedMemberId) return 'Fuzzy';
  return 'Unmatched';
}
function confidenceTone(c: number): 'good' | 'warn' | 'overdue' {
  if (c >= 95) return 'good';
  if (c >= 80) return 'warn';
  return 'overdue';
}

// ── component ────────────────────────────────────────────────────────

export const TreasuryUpload: React.FC<Props> = ({ groupId, groupName, members }) => {
  const currentYear = new Date().getFullYear();
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<number>(currentYear);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TreasuryImportPreviewDto | null>(null);
  const [result, setResult] = useState<TreasuryImportResultDto | null>(null);

  // excelName -> memberId (only filled for rows the treasurer has manually mapped)
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const memberById = useMemo(() => {
    const m = new Map<string, MemberRegistryRow>();
    for (const member of members) m.set(member.id, member);
    return m;
  }, [members]);

  // Rows that need a decision before commit: Fuzzy (auto-suggested but
  // treasurer may want to change) or Unmatched (must pick or skip).
  // NON ACTIVE rows are excluded — they have no member to assign to.
  const decisionRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter(
      (r) => !r.isExactMatch && !r.isNonActive
    );
  }, [preview]);

  // Allow commit only when every Fuzzy row has a matchedMemberId from
  // the backend. Unmatched rows can be left alone (skipped) or assigned
  // via override — they don't block commit.
  const canCommit = useMemo(() => {
    if (!preview) return false;
    const allFuzzyHaveMatch = preview.rows
      .filter((r) => matchStatusOf(r) === 'Fuzzy')
      .every((r) => r.matchedMemberId);
    return allFuzzyHaveMatch;
  }, [preview]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setOverrides({});
    setError(null);
  };

  // ── actions ──────────────────────────────────────────────────────

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await previewTreasuryExcel(groupId, file);
      setPreview(data);
      setOverrides({}); // previous overrides belonged to a previous file
    } catch (err: unknown) {
      const message = extractMessage(err) ?? 'Imeshindwa kuhakiki faili la Excel.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !preview) return;
    if (!confirm('Uthibitisho: baada ya kubonyeza "Thibitisha", data ya kihistoria itaandikwa kwenye mfumo. Endelea?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await commitTreasuryExcel(groupId, file, year, overrides);
      setResult(data);
      setPreview(null); // preview is no longer the source of truth
    } catch (err: unknown) {
      const message = extractMessage(err) ?? 'Imeshindwa kuingiza data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const setOverride = (excelName: string, memberId: string) => {
    setOverrides((prev) => ({ ...prev, [excelName]: memberId }));
  };

  // ── render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── upload form ─────────────────────────────────────────── */}
      <div className="border border-ink-100 rounded-xl bg-paper-raised p-6">
        <h2 className="text-lg font-semibold text-ink-950 mb-1 flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-gold-600" />
          Pakia Jedwali la Hazina (Treasurer's Excel)
        </h2>
        <p className="text-sm text-ink-700 mb-4">
          Jedwali la mwezi-na-mwanachama (JAN..DEC + KIANZIO + MSIBA + SHEREHE) kutoka kwa mtunza-hazina.
          Import hii inarekodi tu historia — haitozi faini mpya, wala haikati akiba kwa miezi iliyopita.
        </p>

        <form onSubmit={handlePreview} className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Faili la Excel (.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setResult(null);
                  setError(null);
                }}
                className="block w-full text-sm text-ink-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-ink-100 file:text-ink-900 file:font-medium hover:file:bg-ink-100/70"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Mwaka wa data
              </label>
              <input
                type="number"
                min={2000}
                max={currentYear + 1}
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || currentYear)}
                className="w-28 rounded-lg border border-ink-100 bg-paper px-3 py-2 text-sm text-ink-950 focus:outline-none focus:ring-2 focus:ring-ink-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!file || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-ink-900 text-ink-50 font-medium px-5 py-2.5 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {loading ? 'Inaprosesi...' : 'Hakiki Kwanza (Preview)'}
            </button>

            {(preview || result || error) && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-100 bg-paper-raised text-ink-700 font-medium px-4 py-2.5 hover:bg-ink-50 transition-colors"
              >
                Anza Upya
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── commit success ───────────────────────────────────────── */}
      {result && (
        <div className="border border-ink-100 rounded-xl bg-paper-raised p-6">
          <div className="flex items-center gap-2 text-standing-good font-semibold">
            <CheckCircle size={20} /> Data ya kihistoria imeingizwa kwa mafanikio
          </div>

          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <SummaryCell label="Mwanachama Waliotumika" value={result.totalRows} />
            <SummaryCell label="Michango Iliyoingizwa" value={result.contributionsPosted} />
            <SummaryCell label="Faini Zilizorekodiwa" value={result.finesPosted} />
            <SummaryCell label="Waliotengwa (Duplicate)" value={result.entriesSkippedDuplicate} />
            <SummaryCell label="KIANZIO Iliyoingizwa" value={result.joiningFeesPosted} />
            <SummaryCell label="Akiba Iliyoingizwa" value={result.savingsPosted} />
            <SummaryCell label="Waliowekwa Non-Active" value={result.membersMarkedInactive} />
            <SummaryCell label="Waliorukwa (Unmatched)" value={result.unmatchedRowsSkipped} />
          </dl>

          <dl className="mt-5 space-y-1.5 text-sm text-ink-800 border-t border-ink-100 pt-4">
            <SumRow label="Jumla ya Michango" value={money(result.totalContributionsAmount)} />
            <SumRow label="Jumla ya Faini Zilizorekodiwa" value={money(result.totalFinesAmount)} />
            <SumRow label="Jumla ya Akiba Iliyoingizwa" value={money(result.totalSavingsAmount)} />
            <SumRow label="Jumla ya KIANZIO" value={money(result.totalJoiningFeesAmount)} />
          </dl>

          {result.msibaShereheDeferred.length > 0 && (
            <div className="mt-5 rounded-lg bg-standing-warn-bg px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-standing-warn">
                <AlertCircle size={16} /> MSIBA/SHEREHE zilizosubiri ({result.msibaShereheDeferred.length})
              </div>
              <p className="mt-1 text-xs text-ink-700">
                Malipo ya watu waliokufa na sherehe yatahitaji katiba ya kikundi ili kuwekwa
                kwenye mfumo (v2).
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-800 list-disc pl-5">
                {result.msibaShereheDeferred.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="mt-5 rounded-lg bg-standing-warn-bg px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-standing-warn">
                <AlertCircle size={16} /> Onyo ({result.warnings.length})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-ink-800 list-disc pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── preview summary ──────────────────────────────────────── */}
      {preview && (
        <div className="border border-ink-100 rounded-xl bg-paper-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink-950 flex items-center gap-2">
              <Sparkles size={18} className="text-gold-600" />
              Matokeo ya Uhakiki — {groupName} ({year})
            </h3>
            <button
              onClick={handleCommit}
              disabled={!canCommit || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-standing-good text-paper font-medium px-5 py-2.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              title={canCommit ? 'Weka data kwenye mfumo' : 'Kuna safu ambayo bado haijapangiwa mwanachama'}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              Thibitisha na Uingize (Commit)
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <SummaryCell label="Mwanachama (Jumla)" value={preview.totalRows} />
            <SummaryCell label="Waliolingana Kabisa" value={preview.exactMatchedRows} tone="good" />
            <SummaryCell label="Wanaohitaji Uchaguzi" value={preview.fuzzyMatchedRows} tone="warn" />
            <SummaryCell label="Wasiolingana" value={preview.unmatchedRows} tone="overdue" />
            <SummaryCell
              label="Safu za NON ACTIVE"
              value={preview.rows.filter((r) => r.isNonActive).length}
            />
          </dl>

          {preview.warnings.length > 0 && (
            <div className="mt-5 rounded-lg bg-standing-warn-bg px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-standing-warn">
                <AlertCircle size={16} /> Onyo la Kundi ({preview.warnings.length})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-ink-800 list-disc pl-5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── per-row decisions ──────────────────────────────────── */}
          {decisionRows.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-ink-800 mb-2">
                Safu zinazohitaji uamuzi ({decisionRows.length})
              </h4>
              <p className="text-xs text-ink-700 mb-3">
                Kwa safu hizi, chagua mwanachama sahihi kutoka orodha, au acha tupu ili zirukwe wakati wa
                kuingiza. "Waliolingana kabisa" wanapewa mwanachama moja kwa moja - hakuna haja ya kubadilisha.
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-700 border-b border-ink-100">
                      <th className="py-2 pr-3">Jina la Excel</th>
                      <th className="py-2 pr-3">Imechaguliwa na Mfumo</th>
                      <th className="py-2 pr-3">Badilisha / Chagua Mwanachama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {decisionRows.map((row) => {
                      const currentOverride = overrides[row.excelName] ?? '';
                      const effective = currentOverride || row.matchedMemberId || '';
                      const status = matchStatusOf(row);
                      const tone = confidenceTone(row.matchConfidence);
                      return (
                        <tr key={row.rowNumber}>
                          <td className="py-2 pr-3 font-medium text-ink-950">
                            {row.excelName}
                            {row.isNonActive && (
                              <span className="ml-2 text-xs text-standing-warn">
                                (Non-Active)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="text-xs">
                              <div className="font-medium text-ink-950">
                                {row.matchedMemberName ?? '— Hakuna —'}
                              </div>
                              <span
                                className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  tone === 'good'
                                    ? 'bg-standing-good-bg text-standing-good'
                                    : tone === 'warn'
                                    ? 'bg-standing-warn-bg text-standing-warn'
                                    : 'bg-standing-overdue-bg text-standing-overdue'
                                }`}
                              >
                                {status} · {row.matchConfidence}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              value={currentOverride}
                              onChange={(e) => setOverride(row.excelName, e.target.value)}
                              className="w-full max-w-xs rounded-lg border border-ink-100 bg-paper px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-600"
                            >
                              <option value="">— Acha kama ilivyo / Ruka —</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} (#{m.memberNumber})
                                </option>
                              ))}
                            </select>
                            {effective && memberById.get(effective) && (
                              <div className="text-xs text-ink-700 mt-1">
                                Uteuzi: <span className="font-medium text-ink-950">{memberById.get(effective)!.name}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── full row-by-row breakdown ──────────────────────────── */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-ink-800 mb-2">Maelezo Kamili ya Kila Safu</h4>
            <div className="space-y-3">
              {preview.rows.map((row) => (
                <PreviewRowCard key={row.rowNumber} row={row} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── sub-components ──────────────────────────────────────────────────

function SummaryCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'good' | 'warn' | 'overdue';
}) {
  const cls =
    tone === 'good'
      ? 'text-standing-good'
      : tone === 'warn'
      ? 'text-standing-warn'
      : tone === 'overdue'
      ? 'text-standing-overdue'
      : 'text-ink-950';
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-ink-700">{label}</div>
      <div className={`figure text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-700">{label}</dt>
      <dd className="figure font-medium text-ink-950">{value}</dd>
    </div>
  );
}

function PreviewRowCard({ row }: { row: TreasuryImportPreviewRowDto }) {
  const status = matchStatusOf(row);
  const tone =
    status === 'Exact'
      ? 'border-standing-good/30'
      : status === 'Fuzzy'
      ? 'border-standing-warn/40'
      : 'border-standing-overdue/40';

  return (
    <div className={`rounded-lg border ${tone} bg-paper p-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium text-ink-950">{row.excelName}</span>
          <span className="text-ink-700 text-sm ml-2">
            → {row.matchedMemberName ?? '—'}
          </span>
          {row.isNonActive && (
            <span className="ml-2 rounded-full bg-standing-warn-bg px-2 py-0.5 text-[10px] font-medium text-standing-warn">
              Non-Active
            </span>
          )}
        </div>
        <div className="text-xs text-ink-700">
          {status} · <span className="figure">{row.matchConfidence}%</span>
        </div>
      </div>

      {row.warnings.length > 0 && (
        <ul className="mt-2 text-xs text-standing-warn space-y-0.5 list-disc pl-5">
          {row.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {row.plannedSplits.length > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
          {row.plannedSplits.map((s) => (
            <div key={s.month} className="rounded bg-ink-50 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-ink-700">{s.monthName}</div>
              {s.totalAmount == null ? (
                <div className="figure text-ink-700">—</div>
              ) : (
                <>
                  <div className="figure text-ink-950 font-semibold">{money(s.totalAmount)}</div>
                  {(s.fine > 0 || s.savings > 0) && (
                    <div className="figure text-[10px] text-ink-700 mt-0.5">
                      {s.contribution > 0 && `mchango ${s.contribution.toLocaleString()}`}
                      {s.fine > 0 && ` + faini ${s.fine.toLocaleString()}`}
                      {s.savings > 0 && ` + akiba ${s.savings.toLocaleString()}`}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {(row.joiningFee || row.msiba || row.sherehe) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {row.joiningFee != null && row.joiningFee > 0 && <Pill label="KIANZIO" value={money(row.joiningFee)} />}
          {row.msiba != null && row.msiba > 0 && <Pill label="MSIBA" value={money(row.msiba)} />}
          {row.sherehe != null && row.sherehe > 0 && <Pill label="SHEREHE" value={money(row.sherehe)} />}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-ink-800">
      <span className="text-[10px] uppercase tracking-wide text-ink-700">{label}</span>
      <span className="figure font-medium">{value}</span>
    </span>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

// Reads the actual error message from a variety of ASP.NET Core / Axios
// error shapes: our own `{ message }`, RFC 7807 ProblemDetails `{ detail }`
// or `{ title }`, or a plain string body. Returns null if nothing matches
// so the caller can fall back to a generic message.
function extractMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (err as any).response?.data ?? (err as any).data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const candidates = [obj.message, obj.detail, obj.title, obj.error];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c;
    }
  }
  // axios sometimes puts the message on err.message itself
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (err as any).message;
  if (typeof m === 'string' && m && !/^request failed/i.test(m)) return m;
  return null;
}