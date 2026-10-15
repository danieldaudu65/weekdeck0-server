import { Crown, Plus, X } from 'lucide-react';
import { newMemberId, type Member } from '../lib/types';

/** Add, rename, remove team members and mark the team lead. */
export function MembersEditor({ members, onChange }: { members: Member[]; onChange: (m: Member[]) => void }) {
  const update = (id: string, patch: Partial<Member>) => onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  return (
    <div className="space-y-2">
      {members.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="figures w-6 shrink-0 text-center text-sm font-bold text-muted">{i + 1}</span>
          <input
            aria-label={`Member ${i + 1} name`}
            value={m.name}
            maxLength={60}
            onChange={(e) => update(m.id, { name: e.target.value })}
            placeholder="Full name"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 font-semibold focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
          />
          <button
            type="button"
            aria-pressed={m.lead}
            title={m.lead ? 'Team lead' : 'Make team lead'}
            onClick={() => onChange(members.map((x) => ({ ...x, lead: x.id === m.id ? !x.lead : x.lead })))}
            className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${m.lead ? 'border-sun bg-sun-soft text-[#8a5a00]' : 'border-line text-muted hover:text-ink'}`}
          >
            <Crown className="size-5" aria-hidden />
            <span className="sr-only">{m.lead ? `${m.name} is team lead` : `Make ${m.name} team lead`}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(members.filter((x) => x.id !== m.id))}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-bad/10 hover:text-bad"
            aria-label={`Remove ${m.name || 'member'}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      ))}
      {members.length < 40 && (
        <button
          type="button"
          onClick={() => onChange([...members, { id: newMemberId(), name: '', lead: false }])}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line font-bold text-blue hover:border-blue/40"
        >
          <Plus className="size-4" aria-hidden /> Add member
        </button>
      )}
    </div>
  );
}
