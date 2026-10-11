import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Download, Volume2 } from "lucide-react";

import {
  DEFAULT_REST_SOUND,
  DEFAULT_WORK_SOUND,
  SOUND_OPTIONS,
  type SoundId,
  isSoundId,
  playSound,
  unlockAudio,
  vibrate,
} from "./lib/timer-sound";
import { releaseWakeLock, requestWakeLock } from "./lib/wake-lock";

type Phase = "work" | "rest";

const DEFAULT_WORK = 60;
const DEFAULT_REST = 10;
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseSeconds(value: string) {
  if (!/^\d{1,4}$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (parsed < MIN_SECONDS || parsed > MAX_SECONDS) return null;
  return parsed;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function TimerPage() {
  const [workInput, setWorkInput] = useState(String(DEFAULT_WORK));
  const [restInput, setRestInput] = useState(String(DEFAULT_REST));
  const [phase, setPhase] = useState<Phase>("work");
  const [remaining, setRemaining] = useState(DEFAULT_WORK);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [laps, setLaps] = useState(0);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [restSound, setRestSound] = useState<SoundId>(DEFAULT_REST_SOUND);
  const [workSound, setWorkSound] = useState<SoundId>(DEFAULT_WORK_SOUND);

  const deadlineRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("work");
  const restSoundRef = useRef<SoundId>(DEFAULT_REST_SOUND);
  const workSoundRef = useRef<SoundId>(DEFAULT_WORK_SOUND);
  const restoredRef = useRef(false);

  // Restaura as escolhas salvas.
  useEffect(() => {
    try {
      const savedRest = localStorage.getItem("timer:sound-rest");
      const savedWork = localStorage.getItem("timer:sound-work");
      if (isSoundId(savedRest)) setRestSound(savedRest);
      if (isSoundId(savedWork)) setWorkSound(savedWork);
    } catch {
      /* silencioso */
    }
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    restSoundRef.current = restSound;
    workSoundRef.current = workSound;
    if (!restoredRef.current) return;
    try {
      localStorage.setItem("timer:sound-rest", restSound);
      localStorage.setItem("timer:sound-work", workSound);
    } catch {
      /* silencioso */
    }
  }, [restSound, workSound]);

  const workSeconds = parseSeconds(workInput);
  const restSeconds = parseSeconds(restInput);
  const workError = workSeconds === null;
  const restError = restSeconds === null;
  const configValid = !workError && !restError;

  const durationFor = useCallback(
    (next: Phase) => (next === "work" ? (workSeconds ?? DEFAULT_WORK) : (restSeconds ?? DEFAULT_REST)),
    [workSeconds, restSeconds],
  );

  // Ajusta o tempo mostrado enquanto o timer está parado e não iniciado.
  useEffect(() => {
    if (running || started) return;
    if (workSeconds !== null) setRemaining(workSeconds);
  }, [workSeconds, running, started]);

  // Laço por horário-alvo (deadline) para evitar drift acumulado.
  useEffect(() => {
    if (!running) return;
    let frame = 0;

    const tick = () => {
      const now = Date.now();
      let left = Math.ceil((deadlineRef.current - now) / 1000);

      if (deadlineRef.current - now <= 0) {
        const current = phaseRef.current;
        const next: Phase = current === "work" ? "rest" : "work";
        // Encadeia a partir do deadline anterior, não do "agora".
        deadlineRef.current += durationFor(next) * 1000;
        // Se a aba ficou muito tempo em segundo plano, realinha.
        if (deadlineRef.current <= now) deadlineRef.current = now + durationFor(next) * 1000;
        phaseRef.current = next;
        setPhase(next);
        if (next === "rest") {
          playSound(restSoundRef.current);
          vibrate([180, 80, 180]);
        } else {
          setLaps((value) => value + 1);
          playSound(workSoundRef.current);
          vibrate([90, 60, 90, 60, 220]);
        }
        left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      }

      setRemaining(Math.max(0, left));
      frame = window.setTimeout(tick, 120);
    };

    tick();
    return () => window.clearTimeout(frame);
  }, [running, durationFor]);

  // Wake lock enquanto roda (com fallback silencioso).
  useEffect(() => {
    if (!running) {
      void releaseWakeLock();
      return;
    }
    void requestWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void releaseWakeLock();
    };
  }, [running]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleStart = () => {
    if (!configValid) return;
    unlockAudio();
    if (!started) {
      phaseRef.current = "work";
      setPhase("work");
      setLaps(0);
      deadlineRef.current = Date.now() + durationFor("work") * 1000;
      setRemaining(durationFor("work"));
      setStarted(true);
    } else {
      deadlineRef.current = Date.now() + remaining * 1000;
    }
    setRunning(true);
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    setRunning(false);
    setStarted(false);
    phaseRef.current = "work";
    setPhase("work");
    setLaps(0);
    setRemaining(workSeconds ?? DEFAULT_WORK);
    vibrate(0);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const total = durationFor(phase);
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
  const isWork = phase === "work";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pb-10 pt-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Timer intervalado</h1>
        {installEvent ? (
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="size-4" aria-hidden="true" />
            Instalar
          </button>
        ) : null}
      </header>

      <section
        aria-live="polite"
        className={`rounded-3xl border p-7 text-center transition-colors ${
          isWork ? "border-primary/40 bg-primary/10" : "border-accent/40 bg-accent/10"
        }`}
      >
        <p
          className={`text-sm font-semibold uppercase tracking-[0.3em] ${
            isWork ? "text-primary" : "text-accent"
          }`}
        >
          {isWork ? "Exercício" : "Pausa"}
        </p>
        <p className="mt-3 font-mono text-[4.5rem] font-bold leading-none tabular-nums text-foreground sm:text-8xl">
          {formatTime(remaining)}
        </p>
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
              isWork ? "bg-primary" : "bg-accent"
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Voltas concluídas: <span className="font-semibold text-foreground">{laps}</span>
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Exercício (s)
          </span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={workInput}
            onChange={(event) => setWorkInput(event.target.value)}
            aria-invalid={workError}
            className={`h-14 rounded-2xl border bg-card px-4 text-xl font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-primary ${
              workError ? "border-destructive" : "border-border"
            }`}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pausa (s)
          </span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={restInput}
            onChange={(event) => setRestInput(event.target.value)}
            aria-invalid={restError}
            className={`h-14 rounded-2xl border bg-card px-4 text-xl font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-accent ${
              restError ? "border-destructive" : "border-border"
            }`}
          />
        </label>
        {!configValid ? (
          <p className="col-span-2 text-sm text-destructive">
            Informe números inteiros entre {MIN_SECONDS} e {MAX_SECONDS} segundos.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-card/40 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sons</h2>
        {(
          [
            { id: "rest", label: "Fim do exercício", value: restSound, set: setRestSound },
            { id: "work", label: "Fim da pausa", value: workSound, set: setWorkSound },
          ] as const
        ).map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2" htmlFor={`sound-${row.id}`}>
              <span className="w-32 shrink-0 text-sm text-muted-foreground">{row.label}</span>
              <select
                id={`sound-${row.id}`}
                value={row.value}
                onChange={(event) => row.set(event.target.value as SoundId)}
                className="h-11 flex-1 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary"
              >
                {SOUND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => playSound(row.value)}
              disabled={row.value === "mudo"}
              aria-label={`Ouvir prévia: ${row.label}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <Volume2 className="size-5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </section>

      <section className="mt-auto grid gap-3">
        {running ? (
          <button
            type="button"
            onClick={handlePause}
            className="h-16 rounded-2xl bg-accent text-lg font-bold text-accent-foreground transition-transform active:scale-[0.98]"
          >
            <span className="inline-flex items-center gap-2">
              <Pause className="size-6" aria-hidden="true" />
              Pausar
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={!configValid}
            className="h-16 rounded-2xl bg-primary text-lg font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Play className="size-6" aria-hidden="true" />
              {started ? "Continuar" : "Iniciar"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="h-14 rounded-2xl border border-border text-base font-semibold text-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="size-5" aria-hidden="true" />
            Zerar
          </span>
        </button>
      </section>
    </main>
  );
}
