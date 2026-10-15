import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Camera, FileUp, KeyRound, LogOut, Save, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { post, setToken, ApiError } from '../lib/api';
import { shrinkImage } from '../lib/importPptx';
import { emptyActivities, type TeamProfile } from '../lib/types';
import { buildDeck } from '../lib/deck';
import { layoutSlide } from '../lib/looks';
import { lookById } from '../lib/templates';
import { mondayOf } from '../lib/weeks';
import { SlideCanvas } from '../components/SlideCanvas';
import { CoverGenerator } from '../components/CoverGenerator';
import { MembersEditor } from '../components/MembersEditor';
import { Button, Card, Field, SectionTitle } from '../components/ui';
import { useToast } from '../components/Toast';

const profileOf = (t: TeamProfile): TeamProfile => ({
  deckTitle: t.deckTitle,
  managerName: t.managerName,
  managerTag: t.managerTag,
  managerRole: t.managerRole,
  teamTitle: t.teamTitle,
  region: t.region,
  activitiesTitle: t.activitiesTitle,
  templateId: t.templateId,
  members: t.members,
  coverImage: t.coverImage,
});

export function TeamPage() {
  const { team, saveTeam, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(team!.name);
  const [p, setP] = useState<TeamProfile>(() => profileOf(team!));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const look = lookById(p.templateId);
  // A live mini cover slide, so you see the picture the way it will appear.
  const coverPreview = useMemo(() => {
    const slide = buildDeck({ team: { ...team!, ...p }, week: { weekStart: mondayOf(), rows: [], activities: emptyActivities(), note: '' }, monthWeeks: [], previousWeek: null, includeSummary: false })[0];
    return layoutSlide(slide, look, { teamName: team!.name, page: 1, total: 1 });
  }, [team, p, look]);

  useEffect(() => {
    setName(team!.name);
    setP(profileOf(team!));
  }, [team]);

  const dirty = name !== team!.name || JSON.stringify(p) !== JSON.stringify(profileOf(team!));
  const set = <K extends keyof TeamProfile>(k: K, v: TeamProfile[K]) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!p.members.some((m) => m.name.trim())) return toast('Add at least one team member', 'bad');
    setSaving(true);
    try {
      await saveTeam({ ...p, members: p.members.filter((m) => m.name.trim()), name: name.trim() });
      toast('Saved');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t save. Try again.', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Choose a photo', 'bad');
    try {
      set('coverImage', await shrinkImage(f));
    } catch {
      toast('That photo couldn’t be used', 'bad');
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-blue">Team</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-4xl">{team!.name}</h1>
        <p className="text-muted">What goes on every deck. Change it once, it stays.</p>
      </div>

      <section>
        <SectionTitle>Cover slide</SectionTitle>
        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Presentation title" value={p.deckTitle} maxLength={80} onChange={(e) => set('deckTitle', e.target.value)} placeholder="Weekly Strategic Session" />
          <Field label="Manager’s name" value={p.managerName} maxLength={60} onChange={(e) => set('managerName', e.target.value)} />
          <Field label="Short title" hint="e.g. KSO" value={p.managerTag} maxLength={20} onChange={(e) => set('managerTag', e.target.value)} />
          <Field label="Role" hint="e.g. Team Lead" value={p.managerRole} maxLength={40} onChange={(e) => set('managerRole', e.target.value)} />
          <div className="min-w-0 md:col-span-2">
            <p className="mb-1.5 text-sm font-bold">Cover photo</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-48 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink/5">
                <SlideCanvas bg={coverPreview.bg} shapes={coverPreview.shapes} label="Your cover slide" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={generating ? 'dark' : 'primary'} size="sm" icon={<Sparkles className="size-4" aria-hidden />} onClick={() => setGenerating((g) => !g)}>
                  {generating ? 'Close' : 'Find a photo'}
                </Button>
                <Button variant="soft" size="sm" icon={<Camera className="size-4" aria-hidden />} onClick={() => fileRef.current?.click()}>
                  Upload
                </Button>
                {p.coverImage && (
                  <Button variant="danger" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => set('coverImage', '')}>
                    Remove
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0]).then(() => (e.target.value = ''))} />
            </div>
            {generating && (
              <CoverGenerator
                theme={look.palette}
                onPick={(url) => {
                  set('coverImage', url);
                  toast('Cover picture added. Tap Save to keep it.');
                }}
              />
            )}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Team</SectionTitle>
        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Team name (for logging in)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Field label="Region" value={p.region} maxLength={40} onChange={(e) => set('region', e.target.value)} placeholder="Fagba" />
          <Field label="Team slide heading" value={p.teamTitle} maxLength={80} onChange={(e) => set('teamTitle', e.target.value)} placeholder="Team Social, Fagba Region" />
          <Field label="Activities slide heading" value={p.activitiesTitle} maxLength={80} onChange={(e) => set('activitiesTitle', e.target.value)} placeholder="Weekly activities" />
        </Card>
      </section>

      <section>
        <SectionTitle>Members</SectionTitle>
        <Card className="p-5">
          <MembersEditor members={p.members} onChange={(m) => set('members', m)} />
          <p className="mt-3 text-xs text-muted">Removing someone keeps their old weeks safe, but they won’t appear on new slides.</p>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link to="/setup" className="flex items-center gap-3 rounded-card border border-line bg-white p-4 font-bold hover:border-blue">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue">
            <FileUp className="size-5" aria-hidden />
          </span>
          Import a PowerPoint again
        </Link>
        <ChangePin />
        <button type="button" onClick={logout} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-left font-bold hover:border-bad">
          <span className="grid size-10 place-items-center rounded-xl bg-bad/10 text-bad">
            <LogOut className="size-5" aria-hidden />
          </span>
          Log out
        </button>
      </section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-3xl bg-ink p-2 pl-5 text-white shadow-2xl">
            <span className="text-sm font-bold">Unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => (setName(team!.name), setP(profileOf(team!)))}>
                Undo
              </Button>
              <Button size="sm" icon={<Save className="size-4" aria-hidden />} loading={saving} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePin() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const pinOk = (v: string) => /^\d{4,6}$/.test(v);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinOk(next)) return toast('The new PIN must be 4 to 6 digits', 'bad');
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/api/auth/pin', { currentPin: current, newPin: next });
      setToken(r.token);
      toast('PIN changed. Other phones are logged out.');
      setOpen(false);
      setCurrent('');
      setNext('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t change the PIN', 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 text-left font-bold hover:border-blue">
        <span className="grid size-10 place-items-center rounded-xl bg-sun-soft text-[#7a4f00]">
          <KeyRound className="size-5" aria-hidden />
        </span>
        Change PIN
      </button>
    );
  return (
    <form onSubmit={submit} className="space-y-3 rounded-card border border-blue bg-white p-4 md:col-span-1">
      <Field label="Current PIN" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))} />
      <Field label="New PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Change
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
