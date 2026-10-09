"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileUp,
  X,
} from "lucide-react";

interface Props {
  onStartScratch: () => void;
  onImport: (data: Record<string, unknown>) => void;
}

function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (data: Record<string, unknown>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((nextFile: File) => {
    setFile(nextFile);
    setError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      if (file.name.endsWith(".json")) {
        onImport(JSON.parse(await file.text()) as Record<string, unknown>);
      } else {
        onImport({ _importType: "document", _fileName: file.name });
      }
    } catch {
      setError("This file could not be read. Check the format and try again.");
      setLoading(false);
    }
  }, [file, onImport]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-session-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-2xl border border-outline-variant/50 bg-surface-container-high p-6 shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-secondary">Continue analysis</p>
            <h2 id="import-session-title" className="mt-1 font-heading text-[19px] font-semibold text-on-surface">Import a previous session</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close import dialog" className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          className={`flex h-[144px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors ${dragOver ? "border-primary bg-primary/8" : "border-outline-variant hover:border-on-surface-variant"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (event.dataTransfer.files[0]) handleFile(event.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json,.md,.txt,.pdf,.doc,.docx"
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.[0]) handleFile(event.target.files[0]);
            }}
          />
          <FileUp size={23} className="text-primary" />
          {file ? (
            <div className="text-center">
              <p className="text-[14px] font-medium text-on-surface">{file.name}</p>
              <p className="mt-1 font-mono text-[10px] text-on-surface-variant">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[13px] text-on-surface">Drop a report or session here</p>
              <p className="mt-1 text-[11px] text-on-surface-variant">JSON, text, document, or PDF</p>
            </div>
          )}
        </button>

        {error ? <p className="mt-3 text-[12px] text-red">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-[13px] text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!file || loading} className="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? "Reading file..." : "Import session"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePhase({ onStartScratch, onImport }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[600px] text-center">
        <h1 className="font-heading text-[clamp(2.5rem,8vw,3rem)] font-bold leading-tight tracking-tight text-on-surface">
          Launch timing<br />intelligence
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-on-surface-variant">
          Describe your game. We find the comparables, show you what they did, and tell you when to launch.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => setModalOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-outline-variant px-6 text-[14px] font-medium text-on-surface transition-colors hover:bg-surface-container-high">
            <FileUp size={18} /> Import
          </button>
          <button type="button" onClick={onStartScratch} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[14px] font-semibold text-on-primary transition-colors hover:bg-primary/90">
            Start from scratch <ArrowRight size={18} />
          </button>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {[
            { n: "1", t: "Describe", d: "Plain text, no forms" },
            { n: "2", t: "Compare", d: "Real Steam data" },
            { n: "3", t: "Analyze", d: "Revenue, reviews, timing" },
            { n: "4", t: "Decide", d: "Keep, move, or mitigate" },
          ].map((step) => (
            <div key={step.n} className="rounded-xl border border-outline-variant/30 bg-surface-container/50 p-3">
              <span className="font-mono text-[11px] text-on-surface-variant">{step.n}</span>
              <p className="mt-1 font-heading text-[14px] font-semibold text-on-surface">{step.t}</p>
              <p className="mt-0.5 text-[12px] text-on-surface-variant">{step.d}</p>
            </div>
          ))}
        </div>
      </div>

      <ImportModal open={modalOpen} onClose={() => setModalOpen(false)} onImport={(data) => { setModalOpen(false); onImport(data); }} />
    </div>
  );
}
