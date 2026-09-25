import { useRef, useState } from 'react';
import { downloadBackup, importFromFile } from '../storage/backup';

// Export / import of everything the app stores. Deliberately blunt about what
// that means: there is no server-side copy, so the exported file is the only
// backup that exists.
export function DataControls({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again after a failure
    if (!file) return;

    const result = await importFromFile(file);
    if (result.ok) {
      setMessage({ tone: 'ok', text: `Restored ${result.sessions} session${result.sessions === 1 ? '' : 's'}.` });
      onImported();
    } else {
      setMessage({ tone: 'error', text: result.error });
    }
  }

  return (
    <section className="border-t border-white/5 pt-8 mt-4">
      <h2 className="text-[10px] tracking-[0.25em] uppercase text-white/30 mb-3">Your data</h2>

      <p className="text-[11px] text-white/40 leading-relaxed max-w-prose">
        Everything above is stored in this browser and nowhere else — there is no
        account and no server copy. Export it to a file you keep. If you clear this
        site's data without that file, your history is gone for good.
      </p>

      <div className="flex flex-wrap gap-3 mt-4">
        <button
          onClick={() => { setMessage(null); downloadBackup(); }}
          className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/30 text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-white transition-colors"
          type="button"
        >
          Export
        </button>
        <button
          onClick={() => { setMessage(null); fileRef.current?.click(); }}
          className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/30 text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-white transition-colors"
          type="button"
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      <p className="text-[10px] text-white/25 mt-3">
        Importing replaces everything currently stored in this browser.
      </p>

      {message && (
        <p className={`text-[11px] mt-3 ${message.tone === 'ok' ? 'text-cyan-300/70' : 'text-red-400/70'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
