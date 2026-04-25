import { useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import Modal from './Modal';
import { Api } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: string;
  canRestore: boolean;
  onRestored?: () => void;
}

export default function VersionHistoryPanel({
  open,
  onClose,
  documentId,
  canRestore,
  onRestored,
}: Props) {
  const [versions, setVersions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [versionContent, setVersionContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await Api.listVersions(documentId);
      setVersions(data.versions);
      setSelected(data.versions[0] || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load(); /* eslint-disable-next-line */
  }, [open, documentId]);

  useEffect(() => {
    if (!selected) {
      setVersionContent(null);
      return;
    }
    Api.getVersion(documentId, selected.id).then((d) => setVersionContent(d.version));
  }, [selected, documentId]);

  async function doRestore(versionId: string) {
    setRestoring(true);
    try {
      await Api.restoreVersion(documentId, versionId);
      setConfirmId(null);
      onRestored?.();
      await load();
      alert(
        'Version restored. The document content view (rich text) is updated; the live editor will reflect this snapshot at the next collaborative cursor refresh.'
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Version history" size="lg">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 max-h-[60vh]">
        <div className="border border-slate-200 rounded overflow-y-auto max-h-[60vh]">
          {loading && <div className="p-3 text-sm text-slate-500">Loading…</div>}
          {!loading && versions.length === 0 && (
            <div className="p-3 text-sm text-slate-500">No versions yet.</div>
          )}
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 ${
                selected?.id === v.id ? 'bg-brand-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">v{v.version_number}</span>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{v.reason || ''}</span>
              </div>
              <div className="text-xs text-slate-600 truncate">{v.title}</div>
              <div className="text-[10px] text-slate-400">
                {new Date(v.created_at).toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">
                by {v.creator_email || '—'}
              </div>
            </button>
          ))}
        </div>
        <div className="border border-slate-200 rounded p-4 overflow-y-auto max-h-[60vh]">
          {!selected && <div className="text-sm text-slate-500">Select a version to preview.</div>}
          {selected && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <History size={14} /> Version {selected.version_number}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(selected.created_at).toLocaleString()}
                  </div>
                </div>
                {canRestore && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirmId(selected.id)}
                  >
                    <RotateCcw size={14} /> Restore this version
                  </button>
                )}
              </div>
              <div className="prose prose-sm max-w-none border-t border-slate-200 pt-3">
                {versionContent ? (
                  <div
                    className="text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: versionContent.content_html || '<em class="text-slate-400">No textual snapshot yet</em>' }}
                  />
                ) : (
                  <div className="text-sm text-slate-500">Loading…</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="font-semibold text-slate-900">Restore version?</h3>
            <p className="text-sm text-slate-500 mt-1">
              This will create a new version with the snapshot content of the selected version.
              The current history is preserved.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={restoring}
                onClick={() => doRestore(confirmId)}
              >
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
