import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, FileUp, ImageOff, Sparkles, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api, put, ApiError } from '../lib/api';
import { readPptx, ImportError } from '../lib/importPptx';
import type { ImportedFigures, ImportedMonthly, ImportResult } from '../lib/importAnalyze';
import { planMonthlyWeeks } from '../lib/importMonthly';
import { DAYS, DAY_LONG, emptyActivities, type Activities, type Member, type TeamProfile, type Week } from '../lib/types';
import { addWeeks, mondayOf, weekRangeLabel } from '../lib/weeks';
import { formatAmount, sumOrNull } from '../lib/money';
import { Area, Button, Card, Field, Logo, SectionTitle, Spinner } from '../components/ui';
import { MembersEditor } from '../components/MembersEditor';
import { useToast } from '../components/Toast';

type Stage = 'upload' | 'reading' | 'review';

const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Importing again must keep each member's id: saved weeks are linked to members by id,
 * so new ids would make every earlier week show blank on the monthly slide.
 */
function keepMemberIds(result: ImportResult, existing: Member[]): ImportResult {
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  const members = result.members.map((m) => {
    const old = existing.find((e) => !used.has(e.id) && sameName(e.name, m.name));
    if (!old) return m;
    used.add(old.id);
    idMap.set(m.id, old.id);
    return { ...m, id: old.id };
  });
  const id = (x: string) => idMap.get(x) ?? x;
  return {
    ...result,
    members,
    figures: result.figures?.map((f) => ({ ...f, memberId: id(f.memberId) })) ?? null,
    monthly: result.monthly ? { ...result.monthly, rows: result.monthly.rows.map((r) => ({ ...r, memberId: id(r.memberId) })) } : null,
  };
}

/**
 * First-time setup (and "import again"): upload last week's PowerPoint,
 * check what WeekDeck found, fix anything, save.
 */
export function SetupPage() {
  const { team, saveTeam, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [profile, setProfile] = useState<TeamProfile>(() => ({
    deckTitle: team?.deckTitle || 'Weekly Strategic Session',
    managerName: team?.managerName ?? '',
    managerTag: team?.managerTag ?? '',
    managerRole: team?.managerRole || 'Team Lead',
    teamTitle: team?.teamTitle || team?.name || '',
    region: team?.region ?? '',
    activitiesTitle: team?.activitiesTitle ?? '',
    templateId: team?.templateId || 'classic',
    members: team?.members ?? [],
    coverImage: team?.coverImage ?? '',
  }));
  const [activities, setActivities] = useState<Activities>(emptyActivities());
  const [figures, setFigures] = useState<ImportedFigures[] | null>(null);
  const [monthly, setMonthly] = useState<ImportedMonthly | null>(null);
  const [saveFigures, setSaveFigures] = useState(true);
  const lastMonday = addWeeks(mondayOf(), -1);
  const [figuresWeek, setFiguresWeek] = useState(lastMonday);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TeamProfile>(k: K, v: TeamProfile[K]) => setProfile((p) => ({ ...p, [k]: v }));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage('reading');
    try {
      const read = await readPptx(file);
      const result = keepMemberIds(read.result, team?.members ?? []);
      const coverImage = read.coverImage;
      setProfile((p) => ({
        ...p,
        deckTitle: result.deckTitle || p.deckTitle,
        managerName: result.managerName || p.managerName,
        managerTag: result.managerTag || p.managerTag,
        managerRole: result.managerRole || p.managerRole,
        teamTitle: result.teamTitle || p.teamTitle,
        region: result.region || p.region,
        activitiesTitle: result.activitiesTitle || p.activitiesTitle,
        members: result.members.length ? result.members : p.members,
        coverImage: coverImage || p.coverImage,
      }));
      setActivities(result.activities);
      setFigures(result.figures);
      setMonthly(result.monthly);
      setFound(result.found);
      setWarnings(result.warnings);
      setStage('review');
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'That file couldn’t be read. Try saving it again as PowerPoint or PDF.');
      setStage('upload');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  };

  const monthPlan = saveFigures ? planMonthlyWeeks(monthly, figures, figuresWeek) : [];

  /** Earlier weeks from the monthly table. A week that already has figures in WeekDeck is never overwritten. */
  const saveMonthlyWeeks = async (memberIds: Set<string>) => {
    if (!monthPlan.length) return;
    const starts = monthPlan.map((p) => p.weekStart).sort();
    const { weeks } = await api<{ weeks: Week[] }>(`/api/weeks?from=${starts[0]}&to=${starts[starts.length - 1]}`);
    const saved = new Map(weeks.map((w) => [w.weekStart, w]));
    for (const p of monthPlan) {
      const old = saved.get(p.weekStart);
      // Only rows of today's members count: rows left behind by an old import (different ids) can be replaced.
      const hasFigures = old?.rows.some((r) => memberIds.has(r.memberId) && (DAYS.some((d) => r[d] != null) || r.weekTotal != null));
      if (hasFigures) continue;
      const rows = p.rows
        .filter((r) => memberIds.has(r.memberId))
        .map((r) => ({ memberId: r.memberId, mon: null, tue: null, wed: null, thu: null, fri: null, nc: null, weekTotal: r.weekTotal }));
      if (!rows.length) continue;
      await put(`/api/weeks/${p.weekStart}`, {
        rows,
        activities: old?.activities ?? emptyActivities(),
        note: old?.note ?? '',
        places: old?.places ?? [],
      });
    }
  };

  const save = async () => {
    const members = profile.members.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name);
    if (!members.length) return setError('Add at least one team member.');
    setError(null);
    setSaving(true);
    try {
      await saveTeam({ ...profile, members });
      const hasFigures = figures && figures.some((f) => sumOrNull([f.mon, f.tue, f.wed, f.thu, f.fri, f.nc]) !== null);
      const hasActivities = DAYS.some((d) => activities[d]);
      if ((saveFigures && hasFigures) || hasActivities) {
        await put(`/api/weeks/${figuresWeek}`, {
          rows: saveFigures && figures ? figures.filter((f) => members.some((m) => m.id === f.memberId)) : [],
          activities,
          note: '',
        });
      }
      await saveMonthlyWeeks(new Set(members.map((m) => m.id)));
      toast('All set! Your team is saved.');
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Not saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const isFirstTime = !team?.members.length;

  return (
    <div className="min-h-dvh">
      <header className="safe-top mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        {isFirstTime ? <Logo size={34} /> : (
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate('/team')}>
            Back
          </Button>
        )}
        {isFirstTime && (
          <Button variant="ghost" size="sm" onClick={logout}>
            Log out
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24">
        <AnimatePresence mode="wait">
          {stage !== 'review' ? (
            <motion.section key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">{isFirstTime ? `Welcome, ${team?.name}!` : 'Import last week’s slides'}</h1>
              <p className="mt-2 text-muted">Upload last week’s slides (PowerPoint or PDF) and WeekDeck fills everything in for you.</p>
              {stage === 'reading' ? (
                <Card className="mt-8">
                  <Spinner label="Reading your slides…" />
                </Card>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={`mt-8 flex w-full flex-col items-center gap-4 rounded-[1.75rem] border-2 border-dashed px-6 py-14 text-center transition ${dragging ? 'border-blue bg-blue-soft' : 'border-line bg-white hover:border-blue/50'}`}
                  >
                    <span className="grid size-16 place-items-center rounded-2xl bg-blue text-white shadow-lg">
                      <FileUp className="size-8" aria-hidden />
                    </span>
                    <span className="text-xl font-extrabold">Tap to choose your slides</span>
                    <span className="text-sm text-muted">or drag it here · PowerPoint (.pptx) or PDF · it stays on your device while being read</span>
                  </button>
                  <input ref={fileRef} type="file" accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
                  {error && (
                    <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-bad/10 p-4 text-sm font-semibold text-bad">
                      <TriangleAlert className="size-5 shrink-0" aria-hidden /> {error}
                    </p>
                  )}
                  <div className="mt-6 text-center">
                    <button type="button" className="font-bold text-blue underline underline-offset-4" onClick={() => setStage('review')}>
                      No slides to upload? Start from scratch
                    </button>
                  </div>
                </>
              )}
            </motion.section>
          ) : (
            <motion.section key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="mt-4">
                <h1 className="text-3xl font-extrabold tracking-tight">{found.length ? 'Here’s what I found' : 'Set up your team'}</h1>
                <p className="mt-2 text-muted">Check it, fix anything that’s off, then save. You only do this once.</p>
                {found.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {found.map((f) => (
                      <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f6ec] px-3 py-1.5 text-sm font-bold text-ok">
                        <Check className="size-4" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                {warnings.map((w) => (
                  <p key={w} className="mt-3 flex gap-2 rounded-2xl bg-sun-soft p-3 text-sm font-semibold text-[#7a4f00]">
                    <TriangleAlert className="size-5 shrink-0" aria-hidden /> {w}
                  </p>
                ))}
              </div>

              <section>
                <SectionTitle>Cover slide</SectionTitle>
                <Card className="grid gap-4 p-5 md:grid-cols-2">
                  <Field label="Presentation title" value={profile.deckTitle} onChange={(e) => set('deckTitle', e.target.value)} maxLength={80} className="md:col-span-2" />
                  <Field label="Manager’s name" value={profile.managerName} onChange={(e) => set('managerName', e.target.value)} maxLength={60} />
                  <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                    <Field label="Short title" placeholder="KSO" value={profile.managerTag} onChange={(e) => set('managerTag', e.target.value)} maxLength={20} />
                    <Field label="Role" placeholder="Team Lead" value={profile.managerRole} onChange={(e) => set('managerRole', e.target.value)} maxLength={40} />
                  </div>
                  <div className="md:col-span-2">
                    <p className="mb-1.5 text-sm font-bold">Cover photo</p>
                    {profile.coverImage ? (
                      <div className="flex items-center gap-4">
                        <img src={profile.coverImage} alt="Cover photo" className="h-24 w-20 rounded-xl object-cover" />
                        <Button variant="danger" size="sm" icon={<ImageOff className="size-4" />} onClick={() => set('coverImage', '')}>
                          Don’t use a photo
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No photo: the cover uses a bold design instead. You can add one on the Team page.</p>
                    )}
                  </div>
                </Card>
              </section>

              <section>
                <SectionTitle>Your team</SectionTitle>
                <Card className="space-y-4 p-5">
                  <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                    <Field label="Team slide heading" placeholder="Team Social Fagba Region" value={profile.teamTitle} onChange={(e) => set('teamTitle', e.target.value)} maxLength={80} />
                    <Field label="Region" placeholder="Fagba" value={profile.region} onChange={(e) => set('region', e.target.value)} maxLength={40} />
                  </div>
                  <MembersEditor members={profile.members} onChange={(m) => set('members', m)} />
                  <p className="text-xs text-muted">Tap the crown to mark the team lead.</p>
                </Card>
              </section>

              {(figures || monthly) && (
                <section>
                  <SectionTitle>Figures from your slides</SectionTitle>
                  <Card className="p-5">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 size-5 accent-[#2747D8]" checked={saveFigures} onChange={(e) => setSaveFigures(e.target.checked)} />
                      <span>
                        <span className="font-bold">{figures ? 'Save these as an earlier week' : 'Save the monthly figures'}</span>
                        <span className="block text-sm text-muted">So your monthly table already includes them.</span>
                      </span>
                    </label>
                    {saveFigures && (
                      <>
                        <label className="mt-4 block text-sm font-bold" htmlFor="fw">
                          Which week were they?
                        </label>
                        <select id="fw" value={figuresWeek} onChange={(e) => setFiguresWeek(e.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-white px-4 font-semibold">
                          {[0, -1, -2, -3, -4].map((n) => {
                            const w = addWeeks(mondayOf(), n);
                            return (
                              <option key={w} value={w}>
                                {n === 0 ? 'This week' : n === -1 ? 'Last week' : `${-n} weeks ago`} · {weekRangeLabel(w)}
                              </option>
                            );
                          })}
                        </select>
                        {figures && <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
                          {figures.map((f) => {
                            const m = profile.members.find((x) => x.id === f.memberId);
                            const total = sumOrNull([f.mon, f.tue, f.wed, f.thu, f.fri]);
                            return (
                              <li key={f.memberId} className="flex justify-between px-4 py-2.5 text-sm">
                                <span className="font-semibold">{m?.name ?? '—'}</span>
                                <span className="figures font-bold">{total !== null ? `₦${formatAmount(total)}` : '–'}</span>
                              </li>
                            );
                          })}
                        </ul>}
                        {monthPlan.length > 0 && (
                          <div className="mt-5">
                            <p className="text-sm font-bold">Earlier weeks from your monthly table</p>
                            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                              {monthPlan.map((p) => (
                                <li key={p.weekStart} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                                  <span>
                                    <span className="font-semibold">{p.label}</span> <span className="text-muted">· {weekRangeLabel(p.weekStart)}</span>
                                  </span>
                                  <span className="figures font-bold">₦{formatAmount(p.rows.reduce((a, r) => a + r.weekTotal, 0))}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-xs text-muted">Weeks you already filled in WeekDeck are kept as they are.</p>
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                </section>
              )}

              <section>
                <SectionTitle>Activities (WPR)</SectionTitle>
                <Card className="space-y-4 p-5">
                  <Field label="Activities slide heading" placeholder="Fagba Social Team WPR Activities" value={profile.activitiesTitle} onChange={(e) => set('activitiesTitle', e.target.value)} maxLength={80} />
                  {DAYS.map((d) => (
                    <Area key={d} label={DAY_LONG[d]} value={activities[d]} maxLength={600} onChange={(e) => setActivities((a) => ({ ...a, [d]: e.target.value }))} placeholder="Where will the team market?" />
                  ))}
                  <p className="flex gap-2 text-xs text-muted">
                    <Sparkles className="size-4 shrink-0 text-blue" aria-hidden /> Each new week starts with these, so you only change what’s different.
                  </p>
                </Card>
              </section>

              {error && (
                <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-sm font-semibold text-bad">
                  {error}
                </p>
              )}
              <div className="sticky bottom-4 z-10 flex gap-3">
                {found.length === 0 && (
                  <Button variant="soft" size="lg" onClick={() => setStage('upload')}>
                    Upload instead
                  </Button>
                )}
                <Button size="lg" full loading={saving} onClick={save}>
                  Save and continue
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
