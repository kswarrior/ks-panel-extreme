import React, { useRef, useState } from 'react';
import { uploadTicketAttachment, deleteTicketAttachment, ticketAttachmentUrl } from '../api/tickets';
import type { TicketAttachment } from '../types/ticket';
import { useConfirm } from '@/shared/stores/confirmStore';

const MAX_BYTES = 25 * 1024 * 1024;

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

interface Props {
  ticketId: number;
  attachments: TicketAttachment[];
  isClosed?: boolean;
  onChanged: () => void;
}

const TicketAttachments: React.FC<Props> = ({ ticketId, attachments, isClosed = false, onChanged }) => {
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) {
      setError('File too large (max 25 MiB).');
      return;
    }
    if (file.size === 0) {
      setError('File is empty.');
      return;
    }
    setUploading(true);
    try {
      await uploadTicketAttachment(ticketId, file);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (a: TicketAttachment) => {
    if (!(await confirm({ title: 'Delete attachment', message: `Delete ${a.file_name}?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteTicketAttachment(ticketId, a.id);
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data || 'Delete failed');
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ks-text-heading)' }}>
          Attachments ({attachments.length})
        </h4>
        <span className="ml-auto text-[11px]" style={{ color: 'var(--ks-text-body)' }}>
          images / pdf / zip / log · max 25 MiB
        </span>
        {!isClosed && (
          <button
            onClick={onPick}
            disabled={uploading}
            className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
            style={{ borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}
          >
            {uploading ? 'Uploading…' : 'Attach file'}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
      {error && <p className="text-xs mb-2" style={{ color: 'var(--ks-accent-danger)' }}>{error}</p>}
      {attachments.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--ks-text-body)' }}>
          No attachments yet{isClosed ? '.' : ' — attach a screenshot, log, or archive.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {attachments.map((a) => {
            const url = ticketAttachmentUrl(ticketId, a.id);
            return (
              <div key={a.id} className="rounded-xl border p-2.5 flex flex-col gap-2 min-w-0" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)' }}>
                {isImage(a.mime) ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ks-card-border)' }}>
                    <img src={url} alt={a.file_name} className="w-full max-h-44 object-contain bg-black/30" loading="lazy" />
                  </a>
                ) : isPdf(a.mime) ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ks-card-border)' }}>
                    <iframe src={url} title={a.file_name} className="w-full h-44 bg-black/30 pointer-events-none" loading="lazy" />
                  </a>
                ) : null}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <a href={url} target={isImage(a.mime) || isPdf(a.mime) ? '_blank' : undefined} rel="noreferrer" download={isImage(a.mime) || isPdf(a.mime) ? undefined : a.file_name} className="text-xs font-medium truncate block hover:underline" style={{ color: 'var(--ks-text-heading)' }} title={a.file_name}>
                      {a.file_name}
                    </a>
                    <div className="text-[11px] truncate" style={{ color: 'var(--ks-text-body)' }}>
                      {a.mime} · {formatSize(a.size_bytes)}
                    </div>
                  </div>
                  {!isClosed && (
                    <button onClick={() => onDelete(a)} className="ks-btn-ghost text-[11px] px-2 py-1 rounded-lg border shrink-0 hover:bg-red-500/10" style={{ borderColor: 'color-mix(in srgb, var(--ks-accent-danger) 25%, transparent)', color: 'var(--ks-text-body)' }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TicketAttachments;
