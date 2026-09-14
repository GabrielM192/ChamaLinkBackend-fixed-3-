import React, { useState } from 'react';
import { uploadMkobaStatement } from '../api/mkoba';
import type { MkobaImportResult } from '../api/mkoba';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  groupId: string;
}

export const MkobaUpload: React.FC<Props> = ({ groupId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MkobaImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await uploadMkobaStatement(groupId, file);
      setResult(res);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any).response?.data?.message
          : undefined;
      setError(message ?? 'Imefeli kupakia faili la M-Koba.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-ink-100 rounded-xl bg-paper-raised p-6">
      <h2 className="text-lg font-semibold text-ink-950 mb-4">Pakia Statement ya M-Koba</h2>

      <form onSubmit={handleUpload} className="space-y-4">
        <input
          type="file"
          accept=".csv,.pdf,.xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-ink-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-ink-100 file:text-ink-900 file:font-medium hover:file:bg-ink-100/70"
        />

        <button
          type="submit"
          disabled={!file || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-ink-900 text-ink-50 font-medium px-5 py-2.5 hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          {loading ? 'Inaprosesi...' : 'Pakia Statement'}
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg bg-ink-50 p-4">
          <div className="flex items-center gap-2 text-standing-good font-semibold">
            <CheckCircle size={20} /> Miamala imekamilika
          </div>

          <dl className="mt-3 space-y-1.5 text-sm text-ink-800">
            <div className="flex justify-between">
              <dt>Miamala Iliyopokewa</dt>
              <dd className="figure font-medium">{result.totalSubmitted}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Iliyofanyiwa kazi kwa mafanikio</dt>
              <dd className="figure font-medium">{result.successfullyProcessed}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Miamala ya Nakala (Duplicates)</dt>
              <dd className="figure font-medium">{result.ignoredDuplicates}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Faini Zilizolipwa</dt>
              <dd className="figure font-medium">TSH {result.totalFinesDeducted.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Akiba za Ziada (Advance)</dt>
              <dd className="figure font-medium">TSH {result.totalWelfareAdded.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
};
