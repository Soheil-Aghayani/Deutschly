import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDailyAvatar } from "./lib/avatar";
import { getDayKey, getPersianDateSummary, getPersianGreeting, getSkyPhase } from "./lib/date";
import { toPersianDigits } from "./lib/format";
import {
  addTask,
  addReward,
  getDailyTarget,
  getDayState,
  getFlowStep,
  getMoodForDay,
  getPendingTreeSeeds,
  markIntroSeen,
  moveGardenItem,
  openLoveCapsule,
  plantGardenItem,
  removeTask,
  removeReward,
  removeGardenItem,
  restoreTask,
  restoreGardenItem,
  setProfile,
  setTodayMood,
  setTodayReward,
  toggleQuest,
} from "./lib/game";
import { loadGameState, saveGameState } from "./lib/storage";
import type { FlowStep, GardenSeedKind, GardenTreeVariant, GameState, MoodLevel, Profile, QuestId, TaskDefinition } from "./types/game";
import { EnergyPicker } from "./components/EnergyPicker";
import { GardenHeader } from "./components/GardenHeader";
import { GardenDecor } from "./components/GardenDecor";
import { GrowthScene } from "./components/GrowthScene";
import { GuideDrawer } from "./components/GuideDrawer";
import { InstallPrompt } from "./components/InstallPrompt";
import { LoveCapsule } from "./components/LoveCapsule";
import { QuestGrid } from "./components/QuestGrid";
import { RewardBanner } from "./components/RewardBanner";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { SkyBackdrop } from "./components/SkyBackdrop";
import { TaskManagerDrawer } from "./components/TaskManagerDrawer";
import { WeekMemory } from "./components/WeekMemory";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import "./styles.css";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastState {
  message: string;
  action?: ToastAction;
}

function prefersDarkMode(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadGameState());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(prefersDarkMode);
  const [todayKey, setTodayKey] = useState(() => getDayKey());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deferredTreeDayKey, setDeferredTreeDayKey] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;
  const energyRef = useRef<HTMLElement | null>(null);
  const questsRef = useRef<HTMLElement | null>(null);
  const gardenRef = useRef<HTMLElement | null>(null);
  const rewardRef = useRef<HTMLElement | null>(null);
  const loveCapsuleRef = useRef<HTMLElement | null>(null);
  const previousFlowStep = useRef<FlowStep | null>(null);
  const today = getDayState(gameState, todayKey);
  const todayMood = getMoodForDay(today);
  const target = getDailyTarget(gameState);
  const flowStep = getFlowStep(gameState, todayKey);
  const pendingTreeSeedDays = getPendingTreeSeeds(gameState);
  const deferredTreePlanting = deferredTreeDayKey === todayKey;
  const focusFlowStep: FlowStep = deferredTreePlanting && flowStep === "plant" ? "reward" : flowStep;
  const todaySummary = getPersianDateSummary(currentTime);
  const greeting = getPersianGreeting(currentTime);
  const skyPhase = getSkyPhase(currentTime);
  const dailyAvatar = getDailyAvatar(gameState.profile.avatarSeed, todayKey);
  const moodAvatarSeed = `${dailyAvatar.seed}:${todayMood}`;
  const installPrompt = useInstallPrompt();
  const showInstallPrompt = !installDismissed
    && !installPrompt.isInstalled
    && (installPrompt.canInstall || installPrompt.isIos || installPrompt.isMobile);
  const isDrawerOpen = guideOpen || settingsOpen || taskManagerOpen;
  const resolvedTheme = gameState.profile.theme === "system"
    ? (systemPrefersDark ? "dark" : "light")
    : gameState.profile.theme;

  useBodyScrollLock(isDrawerOpen);

  useLayoutEffect(() => {
    const historyState = window.history;
    const previousScrollRestoration = historyState.scrollRestoration;
    historyState.scrollRestoration = "manual";

    const resetScroll = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      historyState.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  useEffect(() => {
    document.title = `${gameState.profile.nickname} | باغ قدم‌های کوچک`;
    document.documentElement.lang = "fa";
    document.documentElement.dir = "rtl";
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [gameState.profile.nickname, resolvedTheme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener?.(handleChange);
    return () => mediaQuery.removeListener?.(handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const dayTimer = window.setInterval(() => {
      const now = new Date();
      const nextDayKey = getDayKey(now);
      setCurrentTime(now);
      setTodayKey((currentDayKey) => currentDayKey === nextDayKey ? currentDayKey : nextDayKey);
    }, 60_000);
    return () => window.clearInterval(dayTimer);
  }, []);

  useEffect(() => {
    if (!gameState.hasSeenIntro) setGuideOpen(true);
  }, [gameState.hasSeenIntro]);

  const focusSection = (sectionRef: typeof energyRef) => {
    const section = sectionRef.current;
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => section.focus({ preventScroll: true }), 360);
  };

  useEffect(() => {
    const previousStep = previousFlowStep.current;
    if (previousStep !== null && previousStep !== focusFlowStep) {
      if (focusFlowStep === "energy") focusSection(energyRef);
      if (focusFlowStep === "tasks") focusSection(questsRef);
      if (focusFlowStep === "plant") focusSection(gardenRef);
      if (focusFlowStep === "reward") focusSection(rewardRef);
      if (focusFlowStep === "done") focusSection(loveCapsuleRef);
    }
    previousFlowStep.current = focusFlowStep;
  }, [focusFlowStep]);

  const showToast = (message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2600);
  };

  const handleInstall = async () => {
    const accepted = await installPrompt.install();
    if (accepted) showToast("باغت روی گوشی‌ات نشست 🌱");
  };

  const handleGuideClose = () => {
    if (!gameState.hasSeenIntro) setGameState((current) => markIntroSeen(current));
    setGuideOpen(false);
  };

  const handleMoodChange = (mood: MoodLevel) => {
    setGameState((current) => setTodayMood(current, mood, todayKey));
  };

  const handleQuestToggle = (questId: QuestId) => {
    const result = toggleQuest(gameState, questId, todayKey);
    if (result.blocked) {
      showToast(target === 0 ? "اول یک کار به باغت اضافه کن 🌱" : "برای امروز همین‌قدر کافیه؛ باغت خوشحاله 🌱");
      return;
    }

    const nextToday = getDayState(result.state, todayKey);
    if (nextToday.dailyWin && !today.dailyWin) {
      showToast("درخت امروز آماده‌ست؛ یک جای خوب براش پیدا کن 🌳");
    } else if (nextToday.completedQuestIds.length > today.completedQuestIds.length) {
      const remaining = target - nextToday.completedQuestIds.length;
      showToast(remaining > 0 ? `${toPersianDigits(remaining)} قدم کوچیک دیگه تا شکوفه 🌱` : "قدم قشنگی بود 🌱");
    }
    setGameState(result.state);
  };

  const handlePlant = (kind: GardenSeedKind, slotId: string, sourceDayKey?: string, treeVariant?: GardenTreeVariant) => {
    const result = plantGardenItem(gameState, kind, slotId, sourceDayKey, treeVariant);
    if (result.blocked) {
      showToast("این جایگاه برای کاشت آماده نیست؛ یکی از جای خالی‌ها را انتخاب کن 🌱");
      return;
    }
    setGameState(result.state);
    if (kind === "tree") setDeferredTreeDayKey(null);
    showToast(kind === "tree" ? "درختت توی باغ ریشه گرفت 🌳" : kind === "flower" ? "گل کوچولوت شکوفا شد 🌼" : "بوته‌ات گوشه‌ی باغ جا گرفت 🌿");
  };

  const handleDeferTree = () => {
    setDeferredTreeDayKey(todayKey);
    showToast("درختت همین‌جا منتظرت می‌مونه؛ هر وقت خواستی بکارش 🌱");
  };

  const handleMoveGardenItem = (itemId: string, slotId: string) => {
    const result = moveGardenItem(gameState, itemId, slotId);
    if (result.blocked) {
      showToast("این جایگاه پر یا قفل است؛ یک جای خالی دیگر را امتحان کن 🌱");
      return;
    }
    setGameState(result.state);
    showToast("جای کوچولویش عوض شد ✨");
  };

  const handleRemoveGardenItem = (itemId: string) => {
    const result = removeGardenItem(gameState, itemId);
    const removedItem = result.item;
    if (result.blocked || !removedItem) return;
    setGameState(result.state);
    showToast("از باغ بیرون رفت؛ اگر خواستی برش گردان", {
      label: "برگردان",
      onClick: () => {
        const restored = restoreGardenItem(gameStateRef.current, removedItem);
        if (restored.blocked) {
          showToast("جای قبلی‌اش دیگر خالی نیست؛ اول یک جایگاه باز کن 🌱");
          return;
        }
        setGameState(restored.state);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        setToast(null);
      },
    });
  };

  const handleReward = (reward: string) => {
    setGameState((current) => setTodayReward(current, reward, todayKey));
    showToast("انتخاب قشنگی بود 💛");
  };

  const handleLoveCapsuleOpen = (capsuleId: string) => {
    setGameState((current) => openLoveCapsule(current, capsuleId));
    showToast("این گرمای کوچولو برای تو بود 💌");
  };

  const handleProfileSave = (profile: Profile) => {
    setGameState((current) => setProfile(current, profile));
  };

  const handleAddTask = (task: TaskDefinition) => {
    setGameState((current) => addTask(current, task));
    showToast(`${task.title} به باغ اضافه شد 🌱`);
  };

  const handleAddReward = (reward: string) => {
    setGameState((current) => addReward(current, reward));
    showToast(`${reward} به جایزه‌ها اضافه شد 💛`);
  };

  const handleRemoveReward = (reward: string) => {
    setGameState((current) => removeReward(current, reward));
    showToast(`${reward} از جایزه‌ها کنار رفت`);
  };

  const handleRemoveTask = (taskId: string) => {
    const task = gameState.tasks.find((item) => item.id === taskId);
    const completedBeforeRemoval = Object.fromEntries(
      Object.entries(gameState.days).map(([dayKey, day]) => [dayKey, day.completedQuestIds.includes(taskId)]),
    );
    setGameState((current) => removeTask(current, taskId));
    if (task) {
      showToast(`${task.title} از باغ بیرون رفت`, {
        label: "برگردان",
        onClick: () => {
          setGameState((current) => restoreTask(current, task, completedBeforeRemoval));
          if (toastTimer.current) window.clearTimeout(toastTimer.current);
          setToast(null);
        },
      });
    }
  };

  return (
    <div
      className="app-shell"
      data-palette={gameState.profile.palette}
      data-theme={resolvedTheme}
      data-mood={todayMood}
      data-sky={skyPhase}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("input, textarea, [contenteditable='true']")) event.preventDefault();
      }}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("input, textarea, [contenteditable='true']")) event.preventDefault();
      }}
    >
      <SkyBackdrop phase={skyPhase} />
      <div className="background-orb background-orb--one" aria-hidden="true" />
      <div className="background-orb background-orb--two" aria-hidden="true" />
      <main className="page-shell">
        <GardenHeader
          displayName={gameState.profile.displayName}
          greeting={greeting}
          nickname={gameState.profile.nickname}
          avatarSeed={moodAvatarSeed}
          avatarVariant={dailyAvatar.variant}
          palette={gameState.profile.palette}
          plantStage={gameState.plantStage}
          totalWins={gameState.totalWins}
          gentleStreak={gameState.gentleStreak}
          todayWeekday={todaySummary.weekday}
          todayDate={todaySummary.date}
          onGuide={() => setGuideOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />

        {showInstallPrompt && (
          <InstallPrompt
            canInstall={installPrompt.canInstall}
            isIos={installPrompt.isIos}
            isMobile={installPrompt.isMobile}
            onInstall={handleInstall}
            onDismiss={() => setInstallDismissed(true)}
          />
        )}

        <div className="page-content">
          <EnergyPicker
            value={todayMood}
            confirmed={today.energyConfirmed}
            isNext={flowStep === "energy"}
            sectionRef={energyRef}
            onChange={handleMoodChange}
          />
          <GrowthScene
            completedCount={today.completedQuestIds.length}
            target={target}
            totalWins={gameState.totalWins}
            mood={todayMood}
            avatarSeed={moodAvatarSeed}
            avatarVariant={dailyAvatar.variant}
            palette={gameState.profile.palette}
          />
          <GardenDecor
            lifetimeWins={gameState.lifetimeWins}
            plantedItems={gameState.plantedItems}
            pendingTreeSeedDays={pendingTreeSeedDays}
            deferredTreePlanting={deferredTreePlanting}
            isNext={focusFlowStep === "plant"}
            sectionRef={gardenRef}
            onPlant={handlePlant}
            onDefer={handleDeferTree}
            onMove={handleMoveGardenItem}
            onRemove={handleRemoveGardenItem}
          />
          <WeekMemory days={gameState.days} todayKey={todayKey} />
          <QuestGrid
            quests={gameState.tasks}
            energy={today.energy}
            completedQuestIds={today.completedQuestIds}
            target={target}
            isNext={flowStep === "tasks" || flowStep === "manage"}
            sectionRef={questsRef}
            onManage={() => setTaskManagerOpen(true)}
            onToggle={handleQuestToggle}
          />
          <RewardBanner
            dailyWin={today.dailyWin}
            target={target}
            dayKey={todayKey}
            rewards={gameState.rewards}
            selectedReward={today.rewardChoice}
            isNext={focusFlowStep === "reward"}
            sectionRef={rewardRef}
            onChoose={handleReward}
          />
          <LoveCapsule
            dailyWin={today.dailyWin}
            dayKey={todayKey}
            openedCapsuleIds={gameState.openedLoveCapsuleIds}
            sectionRef={loveCapsuleRef}
            onOpen={handleLoveCapsuleOpen}
          />
        </div>

      <footer className="page-footer">
          <span className="footer-leaf" aria-hidden="true">✦</span>
          <span>Apricity؛ گرمای کوچکی برای روزهای سرد.</span>
        </footer>
      </main>

      <GuideDrawer open={guideOpen} onClose={handleGuideClose} />
      <SettingsDrawer
        open={settingsOpen}
        profile={gameState.profile}
        rewards={gameState.rewards}
        onClose={() => setSettingsOpen(false)}
        onSave={handleProfileSave}
        onAddReward={handleAddReward}
        onRemoveReward={handleRemoveReward}
      />
      <TaskManagerDrawer
        open={taskManagerOpen}
        tasks={gameState.tasks}
        onClose={() => setTaskManagerOpen(false)}
        onAdd={handleAddTask}
        onRemove={handleRemoveTask}
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button type="button" className="toast__action" onClick={toast.action.onClick}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
