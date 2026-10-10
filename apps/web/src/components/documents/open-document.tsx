'use client';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';

type PreviewKind = 'pdf' | 'image' | 'text' | 'docx' | 'other';

function previewKind(mimeType: string, filename: string): PreviewKind {
  const type = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const name = filename.toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.csv')) return 'text';
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }
  return 'other';
}

function errorMessage(error: unknown): string {
  const data = (error as { response?: { data?: ArrayBuffer } })?.response?.data;
  if (data instanceof ArrayBuffer) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(data)) as { message?: string | string[] };
      if (typeof parsed.message === 'string') return parsed.message;
      if (Array.isArray(parsed.message)) return parsed.message.join(' ');
    } catch {
      return 'The original file could not be opened.';
    }
  }
  return 'The original file could not be opened.';
}

export function OpenDocumentButton({
  documentId,
  filename,
}: {
  documentId: string;
  filename: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Open Document
      </Button>
      {open ? (
        <DocumentFileDialog
          documentId={documentId}
          filename={filename}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function DocumentFileDialog({
  documentId,
  filename,
  onClose,
}: {
  documentId: string;
  filename: string;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<PreviewKind>('other');
  const [objectUrl, setObjectUrl] = useState<string>();
  const [text, setText] = useState('');
  const [payload, setPayload] = useState<ArrayBuffer>();

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | undefined;
    setStatus('loading');
    setMessage('');
    setObjectUrl(undefined);
    setText('');
    setPayload(undefined);

    void api
      .get<ArrayBuffer>(`/documents/${documentId}/file`, {
        responseType: 'arraybuffer',
        signal: controller.signal,
      })
      .then((response) => {
        const mimeType = String(response.headers['content-type'] ?? 'application/octet-stream');
        const nextKind = previewKind(mimeType, filename);
        const buffer = response.data;
        setKind(nextKind);
        if (nextKind === 'text') {
          setText(new TextDecoder().decode(buffer));
        } else if (nextKind === 'docx') {
          setPayload(buffer);
        } else {
          createdUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
          setObjectUrl(createdUrl);
        }
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setMessage(errorMessage(error));
      });

    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [documentId, filename]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (status !== 'ready' || kind !== 'docx' || !payload || !hostRef.current) return;
    const host = hostRef.current;
    let cancelled = false;
    host.replaceChildren();
    void import('docx-preview')
      .then(({ renderAsync }) => {
        if (cancelled) return;
        return renderAsync(payload, host, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setMessage('The original file could not be displayed.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, kind, payload]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#0a0f1a]/55 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-document-title"
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_24px_80px_rgba(10,15,26,0.28)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <p id="open-document-title" className="text-sm font-semibold">
              Open Document
            </p>
            <p className="truncate text-sm text-[var(--muted)]">{filename}</p>
          </div>
          <Button ref={closeRef} type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#eef1f4]">
          {status === 'loading' ? (
            <p className="p-6 text-sm text-[var(--muted)]">Opening the original file…</p>
          ) : null}
          {status === 'error' ? (
            <p className="p-6 text-sm text-[var(--danger)]">{message}</p>
          ) : null}
          {status === 'ready' && kind === 'pdf' && objectUrl ? (
            <iframe title={filename} src={objectUrl} className="h-full min-h-[70vh] w-full bg-white" />
          ) : null}
          {status === 'ready' && kind === 'image' && objectUrl ? (
            <div className="flex justify-center p-6">
              <img src={objectUrl} alt={filename} className="max-w-full bg-white" />
            </div>
          ) : null}
          {status === 'ready' && kind === 'text' ? (
            <pre className="min-h-[70vh] whitespace-pre-wrap bg-white p-6 font-mono text-sm text-[var(--ink)]">
              {text}
            </pre>
          ) : null}
          {status === 'ready' && kind === 'docx' ? <div ref={hostRef} className="min-h-[70vh]" /> : null}
          {status === 'ready' && kind === 'other' && objectUrl ? (
            <div className="space-y-3 p-6">
              <p className="text-sm text-[var(--muted)]">
                This file type opens in the browser as a download of the original upload.
              </p>
              <a
                href={objectUrl}
                download={filename}
                className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium"
              >
                Download {filename}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
