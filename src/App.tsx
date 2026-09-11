import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  BookText,
  Brain,
  CalendarPlus,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Clock3,
  Cloud,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Headphones,
  Info,
  Languages,
  LayoutDashboard,
  Library,
  ListChecks,
  Medal,
  Mic,
  Moon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Target,
  Tag,
  Timer,
  Trash2,
  Trophy,
  Upload,
  UploadCloud,
  Volume2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InstallPrompt } from "./components/InstallPrompt";
import { PaginationControls } from "./components/PaginationControls";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { getAvataaarsOptions } from "./lib/avatar";
import { achievementCatalog, getAchievementDefinition } from "./lib/achievements";
import { getPageSlice } from "./lib/pagination";
import type { AchievementDefinition, AchievementId } from "./lib/achievements";
import {
  finishFirebaseRedirectSignIn,
  isFirebaseConfigured,
  loadFirebaseCloudDocument,
  saveFirebaseCloudDocument,
  deleteFirebaseAccount,
  signInWithFirebaseProvider,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
} from "./lib/firebase";
import type { FirebaseAuthProvider, FirebaseUserSummary } from "./lib/firebase";
import { generateGermanWordBatch, getAiUsageStatus, reviewCardWithGemini } from "./lib/gemini";
import type { AiUsageStatus, GeminiCardReview, GeminiCardReviewInput, GermanWordBatchLevel } from "./lib/gemini";
import { playPracticeFeedbackSound } from "./lib/feedbackSounds";
import { formatGermanPartOfSpeech, isGermanWordRecord, mergeGermanWordRecords, normalizeGermanWord, searchGermanWords } from "./data/germanWordsCore";
import type { GermanWordRecord } from "./data/germanWordsCore";
import { loadGermanWordDatabase } from "./data/germanWordsRuntime";
import { assessPdfCandidate, extractMenschenPdf, getMenschenLesson, normalizePdfCandidateStatuses } from "./lib/pdfImport";
import type { PdfCandidate, PdfCandidateStatus } from "./lib/pdfImport";
import { checkSyncHealth, createSyncRoom, normalizeSyncRoom, pullSync, pushSync } from "./lib/sync";
import {
  answerMatches,
  getCardMastery,
  getLevelProgress,
  getPracticeSessionLength,
  getPracticeXp,
  getXpForRating,
  makeClozeSentence,
  scheduleAdaptiveReview,
} from "./lib/learning";
import "./styles.css";

type Tab = "overview" | "study" | "practice" | "library" | "progress";
type Article = "der" | "die" | "das" | "plural" | "none";
type CardKind = "word" | "phrase" | "grammar";
type ReviewRating = "again" | "hard" | "good" | "easy";
type CardStatus = "new" | "learning" | "review";
type Theme = "light" | "dark";
type VerificationStatus = "unverified" | "reference-checked";
type PracticeMode = "article" | "plural" | "translation" | "cloze" | "mixed";
type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error" | "conflict";
type NotificationPermissionState = NotificationPermission | "unsupported";
type ProfileMode = "guest" | "google";
type ProfileOnboardingStep = "choice" | "guest" | "google-confirm";
type FirebaseSyncStrategy = "merge" | "local" | "remote";
type SyncResolution = "merge" | "local" | "remote";
type WordBankDecision = "pending" | "added" | "dismissed";
type ToastAction = { label: string; onClick: () => void };
type ToastState = { message: string; action?: ToastAction };

interface Flashcard {
  id: string;
  german: string;
  translation: string;
  article: Article;
  partOfSpeech?: string;
  plural?: string;
  example?: string;
  note?: string;
  lesson: string;
  deck: string;
  kind: CardKind;
  due: string;
  interval: number;
  status: CardStatus;
  ease?: number;
  repetitions?: number;
  lapses?: number;
  stability?: number;
  difficulty?: number;
  tags?: string[];
  sourcePage?: number;
  lastReviewedAt?: string;
  verification?: VerificationStatus;
  updatedAt?: string;
}

interface PdfImportSummary {
  fileName: string;
  pageCount: number;
  candidateCount: number;
  textPreview: string;
  extractedAt: string;
  candidates: PdfCandidate[];
  candidateStatuses: Record<string, PdfCandidateStatus>;
  candidateStatusUpdatedAt: Record<string, string>;
}

interface AppState {
  cards: Flashcard[];
  wordBank: GermanWordRecord[];
  wordBankInboxIds: string[];
  wordBankDecisions: Record<string, WordBankDecision>;
  wordBankDecisionUpdatedAt: Record<string, string>;
  deletedCardIds: Record<string, string>;
  reviewsToday: number;
  dailyGoal: number;
  streak: number;
  mastered: number;
  studyMinutes: number;
  xp: number;
  totalReviews: number;
  correctReviews: number;
  bestStreak: number;
  achievements: string[];
  achievementUnlockedAt: Record<string, string>;
  weeklyReviews: number[];
  reminderEnabled: boolean;
  reminderTime: string;
  theme: Theme;
  sourceFileName: string;
  pdfImport?: PdfImportSummary;
  lastReviewDay?: string;
  lastStudyDay?: string;
  progressResetAt?: string;
  lastSyncedAt: string;
}

interface CardDraft {
  german: string;
  translation: string;
  article: Article;
  partOfSpeech?: string;
  plural: string;
  example: string;
  note: string;
  tags: string;
  sourcePage?: number;
  lesson: string;
  kind: CardKind;
  referenceChecked: boolean;
  sourceCandidateId?: string;
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "indigo" | "orange" | "mint";
  menuItems?: OverflowMenuItem[];
  active?: boolean;
  complete?: boolean;
}

interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
}

interface FirebaseMergePrompt {
  remoteState: AppState;
  remoteProfileName: string;
}

interface SyncConflict {
  remoteState: AppState;
  remoteUpdatedAt: string;
  localCardCount: number;
  remoteCardCount: number;
}

interface WordBankInboxItem {
  word: GermanWordRecord;
  decision: WordBankDecision;
}

const MOBILE_PAGE_SIZE = 3;
const DESKTOP_PAGE_SIZE = 6;

function getResponsivePageSize(): number {
  if (typeof window === "undefined") return DESKTOP_PAGE_SIZE;
  return window.matchMedia("(max-width: 720px)").matches ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
}

function useResponsivePageSize(): number {
  const [pageSize, setPageSize] = useState(getResponsivePageSize);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updatePageSize = () => setPageSize(mediaQuery.matches ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE);
    updatePageSize();
    mediaQuery.addEventListener?.("change", updatePageSize);
    return () => mediaQuery.removeEventListener?.("change", updatePageSize);
  }, []);

  return pageSize;
}

const STORAGE_KEY = "deutschly:state:v1";
const WORD_BANK_KEY = "deutschly:word-bank:v1";
const SYNC_ENDPOINT_KEY = "deutschly:sync:endpoint:v1";
const SYNC_ROOM_KEY = "deutschly:sync:room:v1";
const AUTO_SYNC_KEY = "deutschly:sync:auto:v1";
const SYNC_BASELINE_KEY = "deutschly:sync:baseline:v1";
const REMINDER_SNOOZE_KEY = "deutschly:reminder:snooze:v3";
const PWA_INSTALL_DISMISSED_KEY = "deutschly:pwa:install-dismissed:v1";
const PROFILE_NAME_KEY = "deutschly:profile:name:v1";
const PROFILE_MODE_KEY = "deutschly:profile:mode:v1";
const PROFILE_NAME_MAX_LENGTH = 32;
const PROFILE_DISPLAY_FALLBACK = "Learner";
const LATIN_PROFILE_NAME_PATTERN = /^[\p{Script=Latin}]+(?:[\s.'’'-]+[\p{Script=Latin}]+)*$/u;

function getSyncBaselineStorageKey(endpoint: string, room: string): string {
  return `${SYNC_BASELINE_KEY}:${encodeURIComponent(endpoint.trim())}:${normalizeSyncRoom(room)}`;
}

function normalizeProfileName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, PROFILE_NAME_MAX_LENGTH);
}

function isValidProfileName(value: string): boolean {
  return value.length > 0 && value.length <= PROFILE_NAME_MAX_LENGTH && LATIN_PROFILE_NAME_PATTERN.test(value);
}

function loadProfileName(): string {
  const name = normalizeProfileName(loadLocalSetting(PROFILE_NAME_KEY));
  return isValidProfileName(name) ? name : "";
}

function getGoogleFirstName(user: FirebaseUserSummary): string {
  const firstToken = user.displayName.trim().split(/\s+/)[0] ?? "";
  const firstName = normalizeProfileName(firstToken);
  return isValidProfileName(firstName) ? firstName : "";
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.258 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.153 7.961 3.039l5.657-5.657C34.046 6.053 29.244 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z" />
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.153 7.961 3.039l5.657-5.657C34.046 6.053 29.244 4 24 4 16.318 4 9.656 8.337 6.306 14.691Z" />
      <path fill="#4CAF50" d="M24 44c5.146 0 9.864-1.971 13.409-5.181l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.236 0-9.626-3.326-11.283-7.946l-6.522 5.025C9.507 39.556 16.227 44 24 44Z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.084 5.581l.003-.002 6.19 5.238C36.971 39.207 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z" />
    </svg>
  );
}

function ProfileAvatarArt({ options }: { options: ReturnType<typeof getAvataaarsOptions> }) {
  const clipId = `profile-avatar-${useId().replace(/:/g, "")}`;
  const skinColors: Record<string, string> = { Light: "#f8d7c1", Pale: "#f3c6a8", Tanned: "#d99a6c", Brown: "#ae6b45", DarkBrown: "#75452f" };
  const hairColors: Record<string, string> = { BrownDark: "#2c1b18", Black: "#1c1b1b", Blonde: "#d6b370", PastelPink: "#d986ae", Red: "#a64b35" };
  const clothesColors: Record<string, string> = { PastelBlue: "#8ed0e8", PastelGreen: "#83cdb1", PastelOrange: "#f0a36d", Heather: "#7f8ca8", Blue01: "#4d74d8", Gray01: "#657080" };
  const skin = skinColors[options.skinColor] ?? skinColors.Light;
  const hair = hairColors[options.hairColor] ?? hairColors.BrownDark;
  const clothes = clothesColors[options.clotheColor] ?? clothesColors.PastelBlue;
  const hasLongHair = options.topType.startsWith("LongHair");
  const hasHijab = options.topType === "Hijab";
  const hasGlasses = options.accessoriesType !== "Blank";
  const isWink = options.eyeType === "Wink";
  const isSurprised = options.eyeType === "Surprised";
  const isSerious = options.mouthType === "Serious";

  return (
    <svg className="profile-avatar__art" viewBox="0 0 264 280" role="img" aria-label="Generated learner avatar" focusable="false">
      <defs><clipPath id={clipId}><circle cx="132" cy="132" r="132" /></clipPath></defs>
      <circle cx="132" cy="132" r="132" fill="#eef1ff" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M27 280c4-55 44-86 105-86s101 31 105 86H27Z" fill={clothes} />
        <path d="M75 212c16-12 36-18 57-18s41 6 57 18l-15 68H90l-15-68Z" fill="rgba(255,255,255,.16)" />
        <ellipse cx="132" cy="125" rx="59" ry="70" fill={skin} />
        <path d="M74 113c-1-48 21-78 59-78 40 0 62 28 58 79-14-19-27-29-46-34-22 18-46 27-71 27Z" fill={hair} />
        {hasLongHair && <path d="M72 104c-17 36-9 104 19 126l25-18-6-93-38-15Zm120 0c17 36 9 104-19 126l-25-18 6-93 38-15Z" fill={hair} />}
        {hasHijab && <path d="M65 120c-9-58 18-91 67-91s76 33 67 91l-18-12c-2-30-20-49-49-49s-47 19-49 49l-18 12Z" fill="#3c4774" />}
        <path d="M96 121c8-5 17-5 25 0" fill="none" stroke="#593b32" strokeWidth="4" strokeLinecap="round" />
        <path d="M143 121c8-5 17-5 25 0" fill="none" stroke="#593b32" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="109" cy="137" rx={isSurprised ? 6 : 4} ry={isSurprised ? 8 : 4} fill="#2e3140" />
        <ellipse cx="155" cy="137" rx={isWink ? 2 : isSurprised ? 6 : 4} ry={isWink ? 1 : isSurprised ? 8 : 4} fill="#2e3140" />
        {hasGlasses && <><rect x="91" y="125" width="37" height="25" rx="10" fill="none" stroke="#4b5577" strokeWidth="4" /><rect x="136" y="125" width="37" height="25" rx="10" fill="none" stroke="#4b5577" strokeWidth="4" /><path d="M128 133h8" stroke="#4b5577" strokeWidth="4" /></>}
        <path d="M125 143c-4 9-5 16 4 17" fill="none" stroke="#b87962" strokeWidth="3" strokeLinecap="round" />
        <path d={isSerious ? "M119 174h26" : "M117 171c9 8 20 8 30 0"} fill="none" stroke="#8b4e4a" strokeWidth="4" strokeLinecap="round" />
        {options.facialHairType !== "Blank" && <path d="M101 160c8 32 54 32 62 0-10 8-20 11-31 11s-21-3-31-11Z" fill={hair} opacity=".82" />}
        {options.topType === "ShortHairTheCaesar" && <path d="M74 83c9-36 31-52 60-52 26 0 45 13 56 39-30-17-71-16-116 13Z" fill={hair} />}
      </g>
    </svg>
  );
}

function ProfileAvatar({ name, dayKey, photoURL, size, className = "" }: { name: string; dayKey: string; photoURL?: string; size: number; className?: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const avatarOptions = getAvataaarsOptions(name.trim() || PROFILE_DISPLAY_FALLBACK, dayKey);
  const imageURL = photoURL?.trim();

  useEffect(() => {
    setPhotoFailed(false);
  }, [imageURL]);

  return (
    <span className={`profile-avatar${className ? ` ${className}` : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      {imageURL && !photoFailed ? <img src={imageURL} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} /> : <ProfileAvatarArt options={avatarOptions} />}
    </span>
  );
}

type FirebaseErrorContext = "auth" | "sync" | "account";

function isFirebaseNetworkError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  return typeof navigator !== "undefined" && !navigator.onLine
    || ["auth/network-request-failed", "unavailable", "network-request-failed"].includes(code)
    || /failed to fetch|network|offline|timed out|timeout|err_connection|connection refused/i.test(message);
}

function firebaseErrorMessage(error: unknown, context: FirebaseErrorContext = "account"): string {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  if (isFirebaseNetworkError(error)) {
    if (context === "auth") return "Google sign-in could not reach the network. Turn on your VPN and try again, or continue as a guest and connect Google later from Settings.";
    if (context === "sync") return "Deutschly could not reach the cloud. Turn on your VPN and try syncing again.";
    return "Deutschly could not reach the account service. Turn on your VPN and try again.";
  }
  const message = error instanceof Error ? error.message : "";
  if (code === "auth/popup-blocked") return "Google sign-in was blocked by the browser. Allow popups for Deutschly, then try again, or continue as a guest.";
  if (code === "auth/missing-initial-state" || /missing initial state|sessionStorage|storage-partitioned/i.test(message)) {
    return "Google sign-in needs a fresh browser session. Open Deutschly in Chrome or Safari, refresh once, and try again, or continue as a guest.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "The sign-in window was closed.";
  if (code === "auth/operation-not-allowed") return "This sign-in provider is not enabled in Firebase yet.";
  if (code === "auth/unauthorized-domain") return "Add this website to Firebase Authentication authorized domains.";
  if (code === "auth/requires-recent-login") return "Sign in again, then retry account deletion for security.";
  if (code === "permission-denied" || code === "firestore/permission-denied") return "Firebase denied access. Check the Firestore rules for this account.";
  if (message.trim()) return message;
  return "Firebase could not complete the account or sync request.";
}

function canUseBrowserSessionStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = "deutschly:auth-storage-check";
    window.sessionStorage.setItem(key, "ok");
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isMobileAuthBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const coarsePointer = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || coarsePointer;
}

function shouldUseFirebaseRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const firebaseHost = /(^|\.)web\.app$|(^|\.)firebaseapp\.com$/i.test(window.location.hostname);
  return firebaseHost && !isMobileAuthBrowser() && canUseBrowserSessionStorage();
}

const navItems: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "study", label: "Study now", icon: Brain },
  { id: "practice", label: "Practice", icon: ListChecks },
  { id: "library", label: "My library", icon: Library },
  { id: "progress", label: "Progress", icon: BarChart3 },
];

function getInitialTab(): Tab {
  if (typeof window === "undefined") return "overview";
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  return navItems.some(({ id }) => id === requestedTab) ? requestedTab as Tab : "overview";
}

const articleMeta: Record<Article, { label: string; detail: string }> = {
  der: { label: "der", detail: "masculine" },
  die: { label: "die", detail: "feminine" },
  das: { label: "das", detail: "neuter" },
  plural: { label: "die", detail: "plural" },
  none: { label: "none", detail: "no article" },
};

const ratingMeta: Array<{ id: ReviewRating; label: string; detail: string; icon: LucideIcon }> = [
  { id: "again", label: "Again", detail: "I forgot", icon: RefreshCw },
  { id: "hard", label: "Hard", detail: "Took effort", icon: Clock3 },
  { id: "good", label: "Good", detail: "I knew it", icon: Check },
  { id: "easy", label: "Easy", detail: "Instant recall", icon: Zap },
];

function getDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return getDayKey(date);
}

function formatDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

const CLOCK_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Guten Morgen";
  if (hour >= 12 && hour < 18) return "Guten Tag";
  if (hour >= 18 && hour < 22) return "Guten Abend";
  return "Gute Nacht";
}

function getNotificationPermission(): NotificationPermissionState {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

function updateReviewBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (value?: number) => Promise<void> | void;
    clearAppBadge?: () => Promise<void> | void;
  };
  const result = count > 0 ? badgeNavigator.setAppBadge?.(count) : badgeNavigator.clearAppBadge?.();
  if (result instanceof Promise) void result.catch(() => undefined);
}

function formatTimeLabel(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return new Intl.DateTimeFormat("en-GB", CLOCK_FORMAT_OPTIONS).format(date);
}

function formatClockLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", CLOCK_FORMAT_OPTIONS).format(date);
}

function getNextReminderAt(reminderTime: string, now = new Date()): Date {
  const [hoursValue, minutesValue] = reminderTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(Number.isFinite(hoursValue) ? hoursValue : 19, Number.isFinite(minutesValue) ? minutesValue : 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

function getNextSnoozeAt(reminderTime: string, now = new Date()): Date {
  const [hoursValue, minutesValue] = reminderTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours((Number.isFinite(hoursValue) ? hoursValue : 19) + 1, Number.isFinite(minutesValue) ? minutesValue : 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

function formatReminderTarget(date: Date, now = new Date()): string {
  const time = formatClockLabel(date);
  return getDayKey(date) === getDayKey(now) ? `at ${time}` : `tomorrow at ${time}`;
}

function formatSyncLabel(timestamp: string): string {
  if (!timestamp) return "Not synced yet";
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (elapsed < 60_000) return "Synced just now";
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Synced ${hours}h ago`;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function formatIcsDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function formatIcsUtcDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function downloadReminderCalendar(reminderTime: string): void {
  const [hoursValue, minutesValue] = reminderTime.split(":").map(Number);
  const hours = Number.isFinite(hoursValue) ? hoursValue : 19;
  const minutes = Number.isFinite(minutesValue) ? minutesValue : 0;
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  if (start.getTime() <= Date.now()) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 30 * 60_000);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const uid = `deutschly-review-${Date.now()}@deutschly`;
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Deutschly//German review reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Deutschly review",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtcDate(new Date())}Z`,
    `DTSTART;TZID=${timezone}:${formatIcsDate(start)}`,
    `DTEND;TZID=${timezone}:${formatIcsDate(end)}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Deutschly German review",
    `DESCRIPTION:${escapeIcsText("Review the cards that are ready in Deutschly. Small steps, strong recall.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([`${calendar}\r\n`], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "deutschly-review-reminder.ics";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadJsonFile(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getStudyWordStyle(card: Flashcard): CSSProperties {
  const renderedLength = card.german.length + (card.article !== "none" ? card.article.length + 1 : 0);
  const preferredSize = Math.min(18, 145 / Math.max(renderedLength, 1));
  return { "--study-word-size": `${preferredSize}cqw` } as CSSProperties;
}

function createInitialCards(): Flashcard[] {
  const due = getDayKey();
  return [
    {
      id: "menschen-01",
      german: "Bahnhof",
      translation: "railway station",
      article: "der",
      plural: "Bahnhöfe",
      example: "Der Bahnhof ist in der Nähe.",
      lesson: "Lesson 1",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-02",
      german: "Wohnung",
      translation: "apartment",
      article: "die",
      plural: "Wohnungen",
      example: "Meine Wohnung ist klein, aber schön.",
      lesson: "Lesson 1",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-03",
      german: "Kind",
      translation: "child",
      article: "das",
      plural: "Kinder",
      example: "Das Kind spielt im Garten.",
      lesson: "Lesson 2",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-04",
      german: "Freunde",
      translation: "friends",
      article: "plural",
      example: "Meine Freunde lernen Deutsch.",
      lesson: "Lesson 2",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-05",
      german: "Arzt",
      translation: "doctor",
      article: "der",
      plural: "Ärzte",
      example: "Der Arzt arbeitet heute.",
      lesson: "Lesson 3",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-06",
      german: "Schule",
      translation: "school",
      article: "die",
      plural: "Schulen",
      example: "Die Schule beginnt um acht Uhr.",
      lesson: "Lesson 3",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-07",
      german: "Buch",
      translation: "book",
      article: "das",
      plural: "Bücher",
      example: "Das Buch liegt auf dem Tisch.",
      lesson: "Lesson 4",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-08",
      german: "Familie",
      translation: "family",
      article: "die",
      plural: "Familien",
      example: "Meine Familie wohnt in Berlin.",
      lesson: "Lesson 4",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-09",
      german: "Stadt",
      translation: "city",
      article: "die",
      plural: "Städte",
      example: "Berlin ist eine große Stadt.",
      lesson: "Lesson 5",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-10",
      german: "Termin",
      translation: "appointment",
      article: "der",
      plural: "Termine",
      example: "Ich habe morgen einen Termin.",
      lesson: "Lesson 5",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-11",
      german: "Frage",
      translation: "question",
      article: "die",
      plural: "Fragen",
      example: "Ich habe eine Frage.",
      lesson: "Lesson 6",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
    {
      id: "menschen-12",
      german: "Wörter",
      translation: "words",
      article: "plural",
      example: "Diese Wörter sind neu.",
      lesson: "Lesson 6",
      deck: "Menschen A1.1",
      kind: "word",
      due,
      interval: 0,
      status: "new",
    },
  ];
}

function createInitialState(): AppState {
  return {
    cards: createInitialCards(),
    wordBank: [],
    wordBankInboxIds: [],
    wordBankDecisions: {},
    wordBankDecisionUpdatedAt: {},
    deletedCardIds: {},
    reviewsToday: 0,
    dailyGoal: 24,
    streak: 0,
    mastered: 0,
    studyMinutes: 0,
    xp: 0,
    totalReviews: 0,
    correctReviews: 0,
    bestStreak: 0,
    achievements: [],
    achievementUnlockedAt: {},
    weeklyReviews: Array.from({ length: 7 }, () => 0),
    reminderEnabled: true,
    reminderTime: "19:00",
    theme: "light",
    sourceFileName: "",
    lastReviewDay: undefined,
    lastStudyDay: undefined,
    lastSyncedAt: new Date().toISOString(),
  };
}

function resetLearningProgress(state: AppState, todayKey: string, resetAt: string): AppState {
  return {
    ...state,
    cards: state.cards.map((card) => ({
      ...card,
      due: todayKey,
      interval: 0,
      status: "new",
      ease: undefined,
      repetitions: 0,
      lapses: 0,
      stability: 0.7,
      difficulty: 5,
      lastReviewedAt: undefined,
      updatedAt: resetAt,
    })),
    reviewsToday: 0,
    streak: 0,
    mastered: 0,
    studyMinutes: 0,
    xp: 0,
    totalReviews: 0,
    correctReviews: 0,
    bestStreak: 0,
    achievements: [],
    achievementUnlockedAt: {},
    weeklyReviews: Array.from({ length: 7 }, () => 0),
    lastReviewDay: undefined,
    lastStudyDay: undefined,
    progressResetAt: resetAt,
    lastSyncedAt: resetAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArticle(value: unknown): value is Article {
  return value === "der" || value === "die" || value === "das" || value === "plural" || value === "none";
}

function isFlashcard(value: unknown): value is Flashcard {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.german === "string"
    && typeof value.translation === "string"
    && isArticle(value.article)
    && typeof value.lesson === "string"
    && typeof value.deck === "string"
    && (value.kind === "word" || value.kind === "phrase" || value.kind === "grammar")
    && typeof value.due === "string"
    && typeof value.interval === "number"
    && (value.status === "new" || value.status === "learning" || value.status === "review");
}

function isPdfCandidate(value: unknown): value is PdfCandidate {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.german === "string"
    && (value.article === "der" || value.article === "die" || value.article === "das")
    && typeof value.page === "number"
    && (value.lesson === undefined || typeof value.lesson === "string")
    && typeof value.context === "string"
    && (value.confidence === undefined || value.confidence === "high" || value.confidence === "medium" || value.confidence === "low")
    && (value.confidenceReasons === undefined || (Array.isArray(value.confidenceReasons) && value.confidenceReasons.every((reason) => typeof reason === "string")));
}

function normalizePdfCandidate(candidate: PdfCandidate): PdfCandidate {
  const assessment = assessPdfCandidate(candidate);
  return {
    ...candidate,
    confidence: assessment.confidence,
    confidenceReasons: assessment.reasons,
  };
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .flatMap((tag) => tag.split(","))
    .map((tag) => tag.trim().slice(0, 24))
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 12);
}

function normalizePdfCandidateStatusUpdatedAt(value: unknown, candidates: PdfCandidate[]): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(candidates.flatMap((candidate) => {
    const updatedAt = value[candidate.id];
    return typeof updatedAt === "string" && updatedAt ? [[candidate.id, updatedAt]] : [];
  }));
}

function normalizeCard(card: Flashcard): Flashcard {
  return {
    ...card,
    tags: normalizeTags(card.tags),
    sourcePage: typeof card.sourcePage === "number" && Number.isFinite(card.sourcePage) && card.sourcePage > 0
      ? Math.floor(card.sourcePage)
      : undefined,
    stability: typeof card.stability === "number" && Number.isFinite(card.stability) && card.stability > 0
      ? Math.min(3650, card.stability)
      : undefined,
    difficulty: typeof card.difficulty === "number" && Number.isFinite(card.difficulty)
      ? Math.min(10, Math.max(1, card.difficulty))
      : undefined,
  };
}

function normalizeDeletedCardIds(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter((entry): entry is [string, string] => {
    const [id, deletedAt] = entry;
    return id.trim().length > 0 && typeof deletedAt === "string" && Number.isFinite(Date.parse(deletedAt));
  });
  return Object.fromEntries(entries.slice(-500));
}

function normalizeWordBankInboxIds(value: unknown, wordBank: GermanWordRecord[]): string[] {
  const availableIds = new Set(wordBank.map((word) => word.id));
  const requestedIds = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && availableIds.has(item))
    : [];
  const legacyGeneratedIds = wordBank.filter((word) => /^ai-/i.test(word.id)).map((word) => word.id);
  return [...new Set([...requestedIds, ...legacyGeneratedIds])].slice(-500);
}

function normalizeWordBankDecisions(value: unknown, inboxIds: string[]): Record<string, WordBankDecision> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(inboxIds.map((id) => {
    const decision = source[id];
    return [id, decision === "added" || decision === "dismissed" ? decision : "pending"];
  }));
}

function normalizeWordBankDecisionUpdatedAt(value: unknown, inboxIds: string[]): Record<string, string> {
  const source = isRecord(value) ? value : {};
  const normalized: Record<string, string> = {};
  inboxIds.forEach((id) => {
    const updatedAt = source[id];
    if (typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))) normalized[id] = updatedAt;
  });
  return normalized;
}

function normalizeAchievementUnlockedAt(value: unknown, achievementIds: string[]): Record<string, string> {
  const source = isRecord(value) ? value : {};
  const normalized: Record<string, string> = {};
  achievementIds.forEach((id) => {
    const unlockedAt = source[id];
    if (typeof unlockedAt === "string" && Number.isFinite(Date.parse(unlockedAt))) normalized[id] = unlockedAt;
  });
  return normalized;
}

function wordBankDecisionPriority(decision: WordBankDecision): number {
  if (decision === "added") return 3;
  if (decision === "dismissed") return 2;
  return 1;
}

function mergeWordBankDecisions(
  localDecisions: Record<string, WordBankDecision>,
  remoteDecisions: Record<string, WordBankDecision>,
  localUpdatedAt: Record<string, string>,
  remoteUpdatedAt: Record<string, string>,
): { decisions: Record<string, WordBankDecision>; updatedAt: Record<string, string> } {
  const decisions: Record<string, WordBankDecision> = {};
  const updatedAt: Record<string, string> = {};
  const ids = new Set([...Object.keys(localDecisions), ...Object.keys(remoteDecisions)]);
  ids.forEach((id) => {
    const localDecision = localDecisions[id];
    const remoteDecision = remoteDecisions[id];
    const localTime = timestamp(localUpdatedAt[id]);
    const remoteTime = timestamp(remoteUpdatedAt[id]);
    const chooseLocal = localTime > remoteTime
      || (localTime === remoteTime && wordBankDecisionPriority(localDecision ?? "pending") >= wordBankDecisionPriority(remoteDecision ?? "pending"));
    const selectedDecision = chooseLocal ? localDecision ?? remoteDecision : remoteDecision ?? localDecision;
    if (selectedDecision) decisions[id] = selectedDecision;
    const selectedUpdatedAt = chooseLocal ? localUpdatedAt[id] : remoteUpdatedAt[id];
    if (selectedUpdatedAt) updatedAt[id] = selectedUpdatedAt;
  });
  return { decisions, updatedAt };
}

function normalizeAppState(value: unknown): AppState {
  const fallback = createInitialState();
  if (!isRecord(value)) return fallback;

  const normalizedCards = (Array.isArray(value.cards) ? value.cards.filter(isFlashcard) : fallback.cards).map(normalizeCard);
  const wordBank = Array.isArray(value.wordBank)
    ? mergeGermanWordRecords(value.wordBank.filter(isGermanWordRecord))
    : fallback.wordBank;
  const wordBankInboxIds = normalizeWordBankInboxIds(value.wordBankInboxIds, wordBank);
  const wordBankDecisions = normalizeWordBankDecisions(value.wordBankDecisions, wordBankInboxIds);
  const wordBankDecisionUpdatedAt = normalizeWordBankDecisionUpdatedAt(value.wordBankDecisionUpdatedAt, wordBankInboxIds);
  const deletedCardIds = normalizeDeletedCardIds(value.deletedCardIds);
  const cards = normalizedCards.filter((card) => {
    const deletedAt = deletedCardIds[card.id];
    return !deletedAt || cardTimestamp(card) > timestamp(deletedAt);
  });
  const normalizedWeeklyReviews = Array.isArray(value.weeklyReviews) && value.weeklyReviews.every((item) => typeof item === "number")
    ? value.weeklyReviews.map((item) => Math.max(0, Math.round(item))).slice(-7)
    : [];
  const weeklyReviews = normalizedWeeklyReviews.length > 0 ? normalizedWeeklyReviews : fallback.weeklyReviews;
  const pdfImportValue = value.pdfImport;
  const pdfImport = isRecord(pdfImportValue)
    && typeof pdfImportValue.fileName === "string"
    && typeof pdfImportValue.pageCount === "number"
    && typeof pdfImportValue.candidateCount === "number"
    && typeof pdfImportValue.textPreview === "string"
    && typeof pdfImportValue.extractedAt === "string"
    && Array.isArray(pdfImportValue.candidates)
    ? (() => {
      const candidates = pdfImportValue.candidates.filter(isPdfCandidate).map((candidate) => ({
        ...candidate,
        lesson: candidate.lesson?.trim() || getMenschenLesson(candidate.page),
      })).map(normalizePdfCandidate);
      const courseCandidates = candidates.filter((candidate) => candidate.lesson);
      const normalizedCandidates = courseCandidates.length > 0 ? courseCandidates : candidates;
      return {
        fileName: pdfImportValue.fileName,
        pageCount: pdfImportValue.pageCount,
        candidateCount: normalizedCandidates.length,
        textPreview: pdfImportValue.textPreview,
        extractedAt: pdfImportValue.extractedAt,
        candidates: normalizedCandidates,
        candidateStatuses: normalizePdfCandidateStatuses(normalizedCandidates, pdfImportValue.candidateStatuses),
        candidateStatusUpdatedAt: normalizePdfCandidateStatusUpdatedAt(pdfImportValue.candidateStatusUpdatedAt, normalizedCandidates),
      };
    })()
    : undefined;
  const achievements = Array.isArray(value.achievements)
    ? value.achievements.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 40)).slice(0, 24)
    : fallback.achievements;

  return {
    ...fallback,
    cards,
    wordBank,
    wordBankInboxIds,
    wordBankDecisions,
    wordBankDecisionUpdatedAt,
    deletedCardIds,
    reviewsToday: typeof value.reviewsToday === "number" ? Math.max(0, Math.round(value.reviewsToday)) : fallback.reviewsToday,
    dailyGoal: typeof value.dailyGoal === "number" ? Math.max(1, Math.round(value.dailyGoal)) : fallback.dailyGoal,
    streak: typeof value.streak === "number" ? Math.max(0, Math.round(value.streak)) : fallback.streak,
    mastered: typeof value.mastered === "number" ? Math.max(0, Math.round(value.mastered)) : fallback.mastered,
    studyMinutes: typeof value.studyMinutes === "number" ? Math.max(0, Math.round(value.studyMinutes)) : fallback.studyMinutes,
    xp: typeof value.xp === "number" ? Math.max(0, Math.round(value.xp)) : fallback.xp,
    totalReviews: typeof value.totalReviews === "number" ? Math.max(0, Math.round(value.totalReviews)) : fallback.totalReviews,
    correctReviews: typeof value.correctReviews === "number" ? Math.max(0, Math.round(value.correctReviews)) : fallback.correctReviews,
    bestStreak: typeof value.bestStreak === "number" ? Math.max(0, Math.round(value.bestStreak)) : fallback.bestStreak,
    achievements,
    achievementUnlockedAt: normalizeAchievementUnlockedAt(value.achievementUnlockedAt, achievements),
    weeklyReviews,
    reminderEnabled: typeof value.reminderEnabled === "boolean" ? value.reminderEnabled : fallback.reminderEnabled,
    reminderTime: typeof value.reminderTime === "string" ? value.reminderTime : fallback.reminderTime,
    theme: value.theme === "dark" ? "dark" : "light",
    sourceFileName: typeof value.sourceFileName === "string" ? value.sourceFileName : fallback.sourceFileName,
    pdfImport,
    lastReviewDay: typeof value.lastReviewDay === "string" ? value.lastReviewDay : fallback.lastReviewDay,
    lastStudyDay: typeof value.lastStudyDay === "string" ? value.lastStudyDay : fallback.lastStudyDay,
    progressResetAt: typeof value.progressResetAt === "string" ? value.progressResetAt : fallback.progressResetAt,
    lastSyncedAt: typeof value.lastSyncedAt === "string" ? value.lastSyncedAt : fallback.lastSyncedAt,
  };
}

function loadState(): AppState {
  const fallback = createInitialState();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const normalizedState = raw ? normalizeAppState(JSON.parse(raw)) : fallback;
    const legacyWordBank = loadGeneratedWordBank();
    const wordBank = mergeGermanWordRecords(normalizedState.wordBank, legacyWordBank);
    const wordBankInboxIds = normalizeWordBankInboxIds([...normalizedState.wordBankInboxIds, ...legacyWordBank.map((word) => word.id)], wordBank);
    return {
      ...normalizedState,
      wordBank,
      wordBankInboxIds,
      wordBankDecisions: normalizeWordBankDecisions(normalizedState.wordBankDecisions, wordBankInboxIds),
      wordBankDecisionUpdatedAt: normalizeWordBankDecisionUpdatedAt(normalizedState.wordBankDecisionUpdatedAt, wordBankInboxIds),
    };
  } catch {
    return fallback;
  }
}

function loadLocalSetting(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

function loadGeneratedWordBank(): GermanWordRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(WORD_BANK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeGermanWordRecords(parsed.filter(isGermanWordRecord)) : [];
  } catch {
    return [];
  }
}

function loadLocalBooleanSetting(key: string): boolean {
  return loadLocalSetting(key) === "true";
}

function loadLocalNumberSetting(key: string): number | null {
  const value = Number(loadLocalSetting(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardTimestamp(card: Flashcard): number {
  return Math.max(timestamp(card.updatedAt), timestamp(card.lastReviewedAt));
}

function cardMergeKey(card: Flashcard): string {
  return `${normalizeGermanTerm(card.german)}|${card.article}|${normalizeLookup(card.translation)}`;
}

function mergeCardVersions(first: Flashcard, second: Flashcard): Flashcard {
  const newer = cardTimestamp(first) >= cardTimestamp(second) ? first : second;
  const older = newer === first ? second : first;
  return {
    ...older,
    ...newer,
    tags: [...new Set([...(older.tags ?? []), ...(newer.tags ?? [])])].slice(0, 12),
  };
}

function mergeCards(localCards: Flashcard[], remoteCards: Flashcard[]): Flashcard[] {
  const byId = new Map<string, Flashcard>();

  [...remoteCards, ...localCards].forEach((card) => {
    const current = byId.get(card.id);
    byId.set(card.id, current ? mergeCardVersions(card, current) : card);
  });

  const byMeaning = new Map<string, Flashcard>();
  [...byId.values()].forEach((card) => {
    const key = cardMergeKey(card);
    const current = byMeaning.get(key);
    byMeaning.set(key, current ? mergeCardVersions(card, current) : card);
  });

  return [...byMeaning.values()];
}

function mergeDeletedCardIds(local: Record<string, string>, remote: Record<string, string>): Record<string, string> {
  const merged = { ...local };
  Object.entries(remote).forEach(([id, deletedAt]) => {
    if (!merged[id] || timestamp(deletedAt) >= timestamp(merged[id])) merged[id] = deletedAt;
  });
  return merged;
}

function mergeAchievementUnlockedAt(local: Record<string, string> | undefined, remote: Record<string, string> | undefined): Record<string, string> {
  const merged: Record<string, string> = { ...(local ?? {}) };
  Object.entries(remote ?? {}).forEach(([id, unlockedAt]) => {
    if (!merged[id] || timestamp(unlockedAt) < timestamp(merged[id])) merged[id] = unlockedAt;
  });
  return merged;
}

function pdfCandidateStatusPriority(status: PdfCandidateStatus): number {
  if (status === "accepted") return 3;
  if (status === "skipped") return 2;
  return 1;
}

function mergePdfImportSummaries(local: PdfImportSummary, remote: PdfImportSummary): PdfImportSummary {
  const localExtractedAt = timestamp(local.extractedAt);
  const remoteExtractedAt = timestamp(remote.extractedAt);
  const latest = localExtractedAt >= remoteExtractedAt ? local : remote;

  if (local.fileName !== remote.fileName || local.extractedAt !== remote.extractedAt) return latest;

  const candidateStatuses = normalizePdfCandidateStatuses(latest.candidates, latest.candidateStatuses);
  const candidateStatusUpdatedAt = { ...latest.candidateStatusUpdatedAt };
  latest.candidates.forEach((candidate) => {
    const localStatus = local.candidateStatuses[candidate.id] ?? "pending";
    const remoteStatus = remote.candidateStatuses[candidate.id] ?? "pending";
    const localUpdatedAt = timestamp(local.candidateStatusUpdatedAt[candidate.id]);
    const remoteUpdatedAt = timestamp(remote.candidateStatusUpdatedAt[candidate.id]);
    const chooseLocal = localUpdatedAt > remoteUpdatedAt
      || (localUpdatedAt === remoteUpdatedAt && pdfCandidateStatusPriority(localStatus) >= pdfCandidateStatusPriority(remoteStatus));
    const selectedStatus = chooseLocal ? localStatus : remoteStatus;
    const selectedUpdatedAt = chooseLocal ? local.candidateStatusUpdatedAt[candidate.id] : remote.candidateStatusUpdatedAt[candidate.id];
    candidateStatuses[candidate.id] = selectedStatus;
    if (selectedUpdatedAt) candidateStatusUpdatedAt[candidate.id] = selectedUpdatedAt;
  });

  return { ...latest, candidateStatuses, candidateStatusUpdatedAt };
}

function mergeAppStates(local: AppState, remote: AppState): AppState {
  const latestReviewState = (local.lastReviewDay ?? "") >= (remote.lastReviewDay ?? "") ? local : remote;
  const localResetAt = timestamp(local.progressResetAt);
  const remoteResetAt = timestamp(remote.progressResetAt);
  const hasDifferentReset = localResetAt !== remoteResetAt;
  const resetState = localResetAt >= remoteResetAt ? local : remote;
  const progressState = hasDifferentReset ? resetState : latestReviewState;
  const weeklyReviews = hasDifferentReset
    ? [...progressState.weeklyReviews]
    : Array.from({ length: 7 }, (_, index) => Math.max(local.weeklyReviews[index] ?? 0, remote.weeklyReviews[index] ?? 0));
  const localPdf = local.pdfImport;
  const remotePdf = remote.pdfImport;
  const pdfImport = localPdf && remotePdf
    ? mergePdfImportSummaries(localPdf, remotePdf)
    : localPdf ?? remotePdf;
  const deletedCardIds = mergeDeletedCardIds(local.deletedCardIds, remote.deletedCardIds);
  const mergedCards = mergeCards(local.cards, remote.cards).filter((card) => {
    const deletedAt = deletedCardIds[card.id];
    return !deletedAt || cardTimestamp(card) > timestamp(deletedAt);
  });
  const wordBank = mergeGermanWordRecords(local.wordBank, remote.wordBank);
  const wordBankInboxIds = normalizeWordBankInboxIds([...local.wordBankInboxIds, ...remote.wordBankInboxIds], wordBank);
  const mergedWordBankDecisions = mergeWordBankDecisions(local.wordBankDecisions, remote.wordBankDecisions, local.wordBankDecisionUpdatedAt, remote.wordBankDecisionUpdatedAt);
  const achievementUnlockedAt = mergeAchievementUnlockedAt(local.achievementUnlockedAt, remote.achievementUnlockedAt);

  return {
    ...local,
    cards: mergedCards,
    wordBank,
    wordBankInboxIds,
    wordBankDecisions: mergedWordBankDecisions.decisions,
    wordBankDecisionUpdatedAt: mergedWordBankDecisions.updatedAt,
    deletedCardIds,
    reviewsToday: hasDifferentReset
      ? progressState.reviewsToday
      : local.lastReviewDay === remote.lastReviewDay ? Math.max(local.reviewsToday, remote.reviewsToday) : latestReviewState.reviewsToday,
    streak: hasDifferentReset ? progressState.streak : Math.max(local.streak, remote.streak),
    mastered: hasDifferentReset ? progressState.mastered : Math.max(local.mastered, remote.mastered),
    studyMinutes: hasDifferentReset ? progressState.studyMinutes : Math.max(local.studyMinutes, remote.studyMinutes),
    xp: hasDifferentReset ? progressState.xp : Math.max(local.xp, remote.xp),
    totalReviews: hasDifferentReset ? progressState.totalReviews : Math.max(local.totalReviews, remote.totalReviews),
    correctReviews: hasDifferentReset ? progressState.correctReviews : Math.max(local.correctReviews, remote.correctReviews),
    bestStreak: hasDifferentReset ? progressState.bestStreak : Math.max(local.bestStreak, remote.bestStreak),
    achievements: hasDifferentReset
      ? [...progressState.achievements]
      : [...new Set([...local.achievements, ...remote.achievements])].slice(0, 24),
    achievementUnlockedAt: hasDifferentReset
      ? { ...progressState.achievementUnlockedAt }
      : achievementUnlockedAt,
    weeklyReviews,
    sourceFileName: pdfImport?.fileName ?? local.sourceFileName,
    pdfImport,
    lastReviewDay: progressState.lastReviewDay,
    lastStudyDay: progressState.lastStudyDay,
    progressResetAt: hasDifferentReset ? progressState.progressResetAt : local.progressResetAt ?? remote.progressResetAt,
    lastSyncedAt: local.lastSyncedAt,
  };
}

function getSyncFingerprint(value: AppState): string {
  const { lastSyncedAt: _lastSyncedAt, ...syncableState } = value;
  return JSON.stringify(syncableState);
}

function createCardDraft(seed: Partial<CardDraft> = {}): CardDraft {
  return {
    german: "",
    translation: "",
    article: "der",
    plural: "",
    example: "",
    note: "",
    tags: "",
    lesson: "Personal cards",
    kind: "word",
    referenceChecked: false,
    ...seed,
  };
}

type CardCheckTone = "success" | "warning" | "error" | "info";

interface CardCheckItem {
  tone: CardCheckTone;
  title: string;
  detail: string;
}

interface CardMatch {
  type: "exact" | "possible";
  card: Flashcard;
}

interface CardCheckResult {
  draft: CardDraft;
  match: CardMatch | null;
  items: CardCheckItem[];
  suggestion?: Partial<CardDraft> & { sourceLabel: string; note: string };
}

const starterReferenceHints: Record<string, Partial<CardDraft> & { sourceLabel: string; note: string }> = {
  eis: {
    article: "das",
    plural: "",
    translation: "ice / ice cream",
    example: "Ich esse gern Eis.",
    sourceLabel: "Starter hint for Eis",
    note: "Everyday ice or ice cream is usually uncountable; add a plural only when you mean kinds or servings.",
  },
  bahnhof: {
    article: "der",
    plural: "Bahnhöfe",
    translation: "railway station",
    sourceLabel: "Menschen starter hint",
    note: "Common A1 noun form; still check the meaning in your course context.",
  },
  wohnung: {
    article: "die",
    plural: "Wohnungen",
    translation: "apartment",
    sourceLabel: "Menschen starter hint",
    note: "Common A1 noun form; still check the meaning in your course context.",
  },
  buch: {
    article: "das",
    plural: "Bücher",
    translation: "book",
    sourceLabel: "Menschen starter hint",
    note: "The umlaut is part of the plural spelling.",
  },
  kind: {
    article: "das",
    plural: "Kinder",
    translation: "child",
    sourceLabel: "Menschen starter hint",
    note: "Common A1 noun form; still check the meaning in your course context.",
  },
};

const germanResourceLinks = [
  { label: "German learning resources", href: "https://github.com/imsanjoykb/German-Language-Learning-Resource" },
  { label: "German Cheat Sheet", href: "https://github.com/Tsimpliarakis/German-Cheat-Sheet" },
  { label: "Tales of Deutsch", href: "https://github.com/StDensity/Tales-of-Deutsch" },
  { label: "Al-Kutshina", href: "https://github.com/koljapluemer/al-kutshina" },
  { label: "German learner", href: "https://github.com/RoiCorporation/german-learner" },
  { label: "Grammatik-Trainer", href: "https://github.com/grammatik-trainer/grammatik-trainer.github.io" },
  { label: "Deutsch lernen", href: "https://github.com/alouche/deutsch-lernen" },
  { label: "Deutsch Lernen A1", href: "https://github.com/emirsametguzel/Deutsch-Lernen-A1" },
];

function normalizeLookup(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[.,!?;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGermanTerm(value: string): string {
  return normalizeLookup(value).replace(/^(der|die|das)\s+/, "").trim();
}

function germanWordToCardDraft(word: GermanWordRecord): Partial<CardDraft> {
  const sourceLabel = word.source
    ? `${word.source.book} · ${word.source.lesson}`
    : `Word bank · ${word.level}`;

  return {
    german: word.german,
    translation: word.englishMeanings.join(" / "),
    article: word.article,
    partOfSpeech: word.partOfSpeech,
    plural: word.plural ?? "",
    example: word.examples?.[0] ?? "",
    tags: word.tags.join(", "),
    note: word.source
      ? `Found in ${word.source.book}, ${word.source.lesson}, page ${word.source.page}.`
      : "",
    lesson: sourceLabel,
    sourcePage: word.source?.page,
    kind: "word",
    referenceChecked: false,
  };
}

function prepareCardDraft(draft: CardDraft): CardDraft {
  const prepared = {
    ...draft,
    german: draft.german.trim(),
    translation: draft.translation.trim(),
    plural: draft.plural.trim(),
    example: draft.example.trim(),
    note: draft.note.trim(),
    tags: draft.tags.trim(),
    lesson: draft.lesson.trim() || "Personal cards",
    sourcePage: typeof draft.sourcePage === "number" && Number.isFinite(draft.sourcePage) && draft.sourcePage > 0
      ? Math.floor(draft.sourcePage)
      : undefined,
  };

  if (prepared.kind === "word") {
    const leadingArticle = prepared.german.match(/^(der|die|das)\s+(.+)$/i);
    if (leadingArticle) {
      prepared.german = leadingArticle[2].trim();
      prepared.article = leadingArticle[1].toLowerCase() as Exclude<Article, "plural" | "none">;
    }
  }

  return prepared;
}

function findCardMatch(cards: Flashcard[], draft: CardDraft): CardMatch | null {
  const german = normalizeGermanTerm(draft.german);
  if (!german) return null;

  const matches = cards.filter((card) => normalizeGermanTerm(card.german) === german);
  if (matches.length === 0) return null;

  const exact = matches.find((card) => (
    card.article === draft.article
    && normalizeLookup(card.translation) === normalizeLookup(draft.translation)
  ));

  if (exact) return { type: "exact", card: exact };
  return {
    type: "possible",
    card: matches.find((card) => card.article === draft.article) ?? matches[0],
  };
}

function isWeakCard(card: Flashcard): boolean {
  return card.status === "learning"
    || (card.status === "review" && (card.difficulty ?? 5) >= 6);
}

function getAverageCardMastery(cards: Flashcard[]): number {
  if (cards.length === 0) return 0;
  return Math.round(cards.reduce((sum, card) => sum + getCardMastery(card), 0) / cards.length);
}

function formatCardCount(cards: Flashcard[]): string {
  return `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
}

function getCardCheck(cards: Flashcard[], draft: CardDraft): CardCheckResult {
  const prepared = prepareCardDraft(draft);
  const match = findCardMatch(cards, prepared);
  const suggestion = starterReferenceHints[normalizeGermanTerm(prepared.german)];
  const items: CardCheckItem[] = [];

  if (match?.type === "exact") {
    items.push({
      tone: "error",
      title: "This card is already in your library",
      detail: `${match.card.german} already has the same article and translation.`,
    });
  } else if (match?.type === "possible") {
    items.push({
      tone: "warning",
      title: "Possible duplicate",
      detail: `${match.card.german} is already saved. It may be a different meaning, so compare the translation before adding it.`,
    });
  } else {
    items.push({
      tone: "success",
      title: "No local duplicate found",
      detail: "This headword and translation are not in your library yet.",
    });
  }

  if (prepared.kind === "word" && /^[A-ZÄÖÜẞ]/.test(prepared.german) && prepared.article === "none") {
    items.push({
      tone: "warning",
      title: "Check the article",
      detail: "Capitalized German words are often nouns. Add der, die, das, or plural if this is a noun.",
    });
  }

  if (normalizeGermanTerm(prepared.german) === "eis" && prepared.article === "das" && !prepared.plural) {
    items.push({
      tone: "info",
      title: "Plural note for Eis",
      detail: "For everyday ice or ice cream, leaving Plural empty is usually right. Add a plural only for a specific meaning, such as kinds or servings.",
    });
  }

  items.push({
    tone: "info",
    title: "Reference check",
    detail: "Deutschly catches duplicates and common entry issues locally; confirm article, meaning, and plural with a reference before saving.",
  });

  if (suggestion) {
    items.push({
      tone: "info",
      title: "A starter hint is available",
      detail: `${suggestion.sourceLabel}: ${suggestion.note}`,
    });
  }

  return { draft: prepared, match, items, suggestion };
}

interface ReviewSchedule {
  due: string;
  interval: number;
  ease: number;
  repetitions: number;
  lapses: number;
  stability: number;
  difficulty: number;
  status: CardStatus;
}

function scheduleReview(card: Flashcard, rating: ReviewRating, todayKey: string): ReviewSchedule {
  return scheduleAdaptiveReview(card, rating, todayKey);
}

function ArticleBadge({ article, compact = false, partOfSpeech }: { article: Article; compact?: boolean; partOfSpeech?: string }) {
  const meta = articleMeta[article];
  if (article === "none") {
    const normalizedPartOfSpeech = formatGermanPartOfSpeech(partOfSpeech) ?? "phrase";
    return <span className={`article-badge article-badge--neutral article-badge--pos-${normalizedPartOfSpeech}${compact ? " article-badge--compact" : ""}`} title={normalizedPartOfSpeech} aria-label={normalizedPartOfSpeech}>{normalizedPartOfSpeech}</span>;
  }

  return (
    <span
      className={`article-badge article-badge--${article}${compact ? " article-badge--compact" : ""}`}
      aria-label={`${meta.label}, ${meta.detail}`}
    >
      <span>{meta.label}</span>
      {!compact && <small>{meta.detail}</small>}
    </span>
  );
}

function OverflowMenu({ label, items, className = "" }: { label: string; items: OverflowMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuId = `overflow-menu-${useId().replace(/:/g, "")}`;

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    firstItemRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    if (menuItems.length === 0) return;
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length;
      menuItems[nextIndex]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      menuItems[event.key === "Home" ? 0 : menuItems.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };

  return (
    <div ref={menuRef} className={`overflow-menu${className ? ` ${className}` : ""}`}>
      <button ref={triggerRef} type="button" className="icon-button icon-button--small overflow-menu__trigger" onClick={() => setOpen((current) => !current)} aria-label={label} aria-expanded={open} aria-haspopup="menu" aria-controls={menuId} title={label}><MoreHorizontal size={17} aria-hidden="true" /></button>
      {open && <div id={menuId} className="overflow-menu__panel" role="menu" aria-label={label} onKeyDown={handleMenuKeyDown}>{items.map((item, index) => <button ref={index === 0 ? firstItemRef : undefined} type="button" className="overflow-menu__item" role="menuitem" key={item.label} onClick={() => { closeMenu(true); item.onSelect(); }}>{item.label}</button>)}</div>}
    </div>
  );
}

const MODAL_FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function useModalFocus<T extends HTMLElement>(onClose?: () => void, preferredFocus?: () => HTMLElement | null, autoFocus = true) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const preferredFocusRef = useRef(preferredFocus);
  onCloseRef.current = onClose;
  preferredFocusRef.current = preferredFocus;

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitialControl = () => {
      if (!autoFocus) {
        panel?.focus();
        return;
      }
      const preferred = preferredFocusRef.current?.();
      const first = preferred ?? panel?.querySelector<HTMLElement>(MODAL_FOCUSABLE_SELECTOR);
      first?.focus();
    };
    const animationFrame = window.requestAnimationFrame(focusInitialControl);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [autoFocus]);

  return panelRef;
}

function StatCard({ icon: Icon, label, value, detail, tone, menuItems = [], active = false, complete = false }: StatCardProps) {
  return (
    <article className={`stat-card${active ? " stat-card--active" : ""}${complete ? " stat-card--complete" : ""}`}>
      <div className={`stat-card__icon stat-card__icon--${tone}${active ? " stat-card__icon--active" : ""}${complete ? " stat-card__icon--complete" : ""}`} aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div className="stat-card__content">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {menuItems.length > 0 && <OverflowMenu label={`More options for ${label}`} items={menuItems} className="stat-card__menu" />}
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" className="text-button" onClick={action.onClick}>
          {action.label}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function OverviewPage({
  state,
  profileName,
  dueCards,
  currentTime,
  onStartReview,
  onAddCard,
  onOpenLibrary,
  onViewProgress,
  onReminderToggle,
  onReminderTimeChange,
  onSnoozeReminder,
  onAddReminderToCalendar,
  notificationPermission,
  onEnableNotifications,
  reminderSnoozedUntil,
}: {
  state: AppState;
  profileName: string;
  dueCards: Flashcard[];
  currentTime: Date;
  onStartReview: () => void;
  onAddCard: () => void;
  onOpenLibrary: () => void;
  onViewProgress: () => void;
  onReminderToggle: () => void;
  onReminderTimeChange: (value: string) => void;
  onSnoozeReminder: () => void;
  onAddReminderToCalendar: () => void;
  notificationPermission: NotificationPermissionState;
  onEnableNotifications: () => void;
  reminderSnoozedUntil: number | null;
}) {
  const progress = Math.min(100, Math.round((state.reviewsToday / state.dailyGoal) * 100));
  const hasActivityToday = state.reviewsToday > 0;
  const goalComplete = progress >= 100;
  const dateLabel = formatDate(currentTime);
  const greeting = getGreeting(currentTime);
  const reminderTarget = reminderSnoozedUntil ? new Date(reminderSnoozedUntil) : getNextReminderAt(state.reminderTime, currentTime);
  const reminderTargetLabel = formatReminderTarget(reminderTarget, currentTime);
  const reminderActionLabel = reminderSnoozedUntil ? "Cancel snooze" : "Snooze";
  const reminderActionDescription = reminderSnoozedUntil ? `Cancel snooze scheduled ${reminderTargetLabel}` : `Snooze reminder until ${reminderTargetLabel}`;
  const menschenCards = state.cards.filter((card) => card.deck === "Menschen A1.1");
  const listeningCards = state.cards.filter((card) => card.deck === "Everyday listening");
  const courseProgress = getAverageCardMastery(menschenCards);
  const listeningProgress = getAverageCardMastery(listeningCards);
  const week = [
    { label: "M", value: state.weeklyReviews[0] ?? 0 },
    { label: "T", value: state.weeklyReviews[1] ?? 0 },
    { label: "W", value: state.weeklyReviews[2] ?? 0 },
    { label: "T", value: state.weeklyReviews[3] ?? 0 },
    { label: "F", value: state.weeklyReviews[4] ?? 0 },
    { label: "S", value: state.weeklyReviews[5] ?? 0 },
    { label: "S", value: state.weeklyReviews[6] ?? 0 },
  ];
  const maxWeek = Math.max(...week.map((item) => item.value), 1);

  return (
    <div className="page-stack dashboard-page">
      <section className="page-intro">
        <div>
          <span className="page-kicker">{dateLabel}</span>
          <h1>{greeting}, {profileName}<span className="title-dot">.</span></h1>
          <p>A few focused reviews today will make your German stick tomorrow.</p>
        </div>
        <div className="sync-summary">
          <span className="sync-summary__dot" aria-hidden="true" />
          <span>{formatSyncLabel(state.lastSyncedAt)}</span>
        </div>
      </section>

      <section className="dashboard-hero-grid" aria-label="Daily study overview">
        <article className={`hero-card${goalComplete ? " hero-card--goal-complete" : ""}`}>
          <div className="hero-card__topline">
          <span className={`hero-card__eyebrow${hasActivityToday ? " hero-card__eyebrow--active" : ""}${goalComplete ? " hero-card__eyebrow--complete" : ""}`}><Flame size={14} aria-hidden="true" /> {state.streak > 0 ? `${state.streak}-day streak` : "Today's path"}</span>
            <span className={`hero-card__goal${goalComplete ? " hero-card__goal--complete" : ""}`}><Target size={14} aria-hidden="true" /> {goalComplete ? "Goal complete" : "Daily goal"}</span>
          </div>
          <div className="hero-card__body">
            <div className="hero-card__copy">
              <h2>{goalComplete ? "Streak secured!" : state.reviewsToday > 0 ? "Keep going!" : "Start your streak."}</h2>
              <button type="button" className="button button--light" onClick={onStartReview}>
                {dueCards.length > 0 ? "Start review" : "Open practice"}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="hero-card__progress-side">
              <div className="progress-ring" style={{ "--progress": `${progress}%` } as CSSProperties} aria-label={`${progress}% of daily goal complete`}>
                <div className="progress-ring__inner">
                  <strong>{progress}%</strong>
                  <span>today</span>
                </div>
              </div>
              <span className="hero-card__progress-caption">{state.dailyGoal - state.reviewsToday > 0 ? `${state.dailyGoal - state.reviewsToday} to go` : "Goal complete"}</span>
            </div>
          </div>
        </article>

        <aside className="reminder-card">
          <div className="reminder-card__heading">
            <div className="card-icon card-icon--orange" aria-hidden="true"><Bell size={18} /></div>
            <button type="button" className={`switch${state.reminderEnabled ? " switch--on" : ""}`} onClick={onReminderToggle} aria-pressed={state.reminderEnabled} aria-label="Toggle daily reminder">
              <span />
            </button>
          </div>
          <span className="card-label">Smart reminder</span>
          <h2>{state.reminderEnabled ? "A little nudge, at the right time." : "Reminders are paused."}</h2>
          <p>We’ll remind you when your next review window opens.</p>
          <label className="time-field">
            <span>Review time</span>
            <input type="time" value={state.reminderTime} onChange={(event) => onReminderTimeChange(event.target.value)} disabled={!state.reminderEnabled} />
          </label>
          <div className="reminder-card__actions">
            <button type="button" className="button button--ghost" onClick={onAddReminderToCalendar}><CalendarPlus size={14} aria-hidden="true" /> Calendar</button>
            <button type="button" className="button button--ghost reminder-card__snooze-button" onClick={onSnoozeReminder} disabled={!state.reminderEnabled} aria-pressed={Boolean(reminderSnoozedUntil)} aria-label={reminderActionDescription} title={reminderActionDescription}>
              {reminderSnoozedUntil ? <X size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
              {reminderActionLabel}
            </button>
          </div>
          <div className={`reminder-card__notification reminder-card__notification--${notificationPermission}`} role="status" aria-live="polite">
            <span className="reminder-card__notification-copy">
              {notificationPermission === "granted" ? <CheckCircle2 size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
              <span>{notificationPermission === "granted" ? "Browser alerts are on." : notificationPermission === "default" ? "Allow alerts for review reminders." : notificationPermission === "denied" ? "Notifications are blocked. Calendar still works when closed." : "In-app reminder only. Add it to your calendar."}</span>
            </span>
            {notificationPermission === "default" && <button type="button" className="text-button" onClick={onEnableNotifications}>Enable</button>}
          </div>
        </aside>
      </section>

      <section className="stats-grid" aria-label="Your statistics">
        <StatCard icon={Flame} label="Current streak" value={`${state.streak} days`} detail={`Best: ${state.bestStreak} days`} tone="orange" active={hasActivityToday} complete={goalComplete} menuItems={[{ label: "View progress", onSelect: onViewProgress }]} />
        <StatCard icon={BookMarked} label="Mastered cards" value={String(state.mastered)} detail="+18 this month" tone="indigo" menuItems={[{ label: "Open library", onSelect: onOpenLibrary }]} />
        <StatCard icon={Timer} label="Study time" value={`${state.studyMinutes} min`} detail="Today · 24 min goal" tone="mint" menuItems={[{ label: "View progress", onSelect: onViewProgress }]} />
      </section>

      <section className="content-grid">
        <div className="main-column">
          <SectionHeading eyebrow="KEEP GOING" title="Continue learning" action={{ label: dueCards.length > 0 ? "Open study" : "Open practice", onClick: onStartReview }} />
          <article className="continue-card">
            <div className="continue-card__content">
              <div className="continue-card__topline">
                <span className="deck-pill"><BookOpen size={14} aria-hidden="true" /> Menschen A1.1</span>
                <span className="muted-label">{dueCards.length} due · {getPracticeSessionLength(getLevelProgress(state.xp).level, dueCards.length)} this session</span>
              </div>
              <h3>Vocabulary essentials</h3>
              <p>Lessons 1–6 · nouns, everyday phrases, and your first conversations.</p>
              <div className="mini-progress"><span style={{ width: `${courseProgress}%` }} /></div>
              <div className="continue-card__footer">
                <span>{courseProgress}% complete</span>
                <button type="button" className="inline-button" onClick={onStartReview}>{dueCards.length > 0 ? "Continue" : "Open practice"} <ArrowRight size={15} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="flashcard-preview" aria-label="Flashcard preview">
              <div className="flashcard-preview__topline"><ArticleBadge article="der" compact /><span>Word</span></div>
              <strong>Bahnhof</strong>
              <span>railway station</span>
              <div className="flashcard-preview__example">Der Bahnhof ist in der Nähe.</div>
              <PronunciationButton text="der Bahnhof" />
            </div>
          </article>

          <SectionHeading eyebrow="YOUR COLLECTION" title="Your decks" action={{ label: "View library", onClick: onOpenLibrary }} />
          <div className="deck-grid">
            <DeckCard icon={BookOpen} title="Menschen A1.1" subtitle="Course vocabulary" progress={courseProgress} count={formatCardCount(menschenCards)} tone="indigo" onClick={onOpenLibrary} onAddCard={onAddCard} />
            <DeckCard icon={Headphones} title="Everyday listening" subtitle="Phrases & dialogues" progress={listeningProgress} count={formatCardCount(listeningCards)} tone="mint" onClick={onOpenLibrary} onAddCard={onAddCard} />
            <button type="button" className="new-deck-card" onClick={onAddCard}>
              <span className="new-deck-card__icon"><Plus size={20} aria-hidden="true" /></span>
              <strong>Add your own cards</strong>
              <span>Build a personal deck</span>
            </button>
          </div>

          <div className="article-legend" aria-label="Article color key">
            <span className="article-legend__title">Article colors</span>
            <ArticleBadge article="der" compact />
            <ArticleBadge article="die" compact />
            <ArticleBadge article="das" compact />
            <span className="article-badge article-badge--plural article-badge--compact"><span>die</span><small>plural</small></span>
          </div>
        </div>

        <aside className="side-column">
          <article className="week-card">
            <div className="side-card__heading">
              <div>
                <span className="section-eyebrow">THIS WEEK</span>
                <h2>Your activity</h2>
              </div>
              <Activity size={19} aria-hidden="true" />
            </div>
            <div className="chart-area" aria-label="Weekly reviews chart">
              {week.map((item, index) => (
                <div className={`chart-column${index === week.length - 1 ? " chart-column--today" : ""}`} key={`${item.label}-${index}`}>
                  <div className="chart-column__track"><span style={{ height: `${Math.max(10, Math.round((item.value / maxWeek) * 100))}%` }} /></div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="week-card__footer"><strong>{week.reduce((sum, item) => sum + item.value, 0)}</strong><span>reviews this week</span></div>
          </article>

          <article className="due-card">
            <div className="side-card__heading">
              <div>
                <span className="section-eyebrow">UP NEXT</span>
                <h2>Review queue</h2>
              </div>
              <span className="count-badge">{dueCards.length}</span>
            </div>
            <div className="due-list">
              {dueCards.slice(0, 4).map((card) => (
                <button type="button" className="due-row" key={card.id} onClick={onStartReview}>
                  <ArticleBadge article={card.article} partOfSpeech={card.partOfSpeech} compact />
                  <span className="due-row__word">{card.german}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button type="button" className="button button--outline button--full" onClick={onStartReview}>
              {dueCards.length > 0 ? "Start review" : "Open practice"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <button type="button" className="source-card" onClick={onOpenLibrary}>
            <div className="source-card__icon" aria-hidden="true"><FileText size={18} /></div>
            <div>
              <strong>Menschen PDF</strong>
              <span>{state.sourceFileName || "Attach your course PDF in Library"}</span>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </aside>
      </section>
    </div>
  );
}

function DeckCard({ icon: Icon, title, subtitle, progress, count, tone, onClick, onAddCard }: { icon: LucideIcon; title: string; subtitle: string; progress: number; count: string; tone: "indigo" | "mint"; onClick: () => void; onAddCard: () => void }) {
  return (
    <article className="deck-card">
      <button type="button" className="deck-card__main" onClick={onClick}>
        <div className={`deck-card__icon deck-card__icon--${tone}`} aria-hidden="true"><Icon size={19} /></div>
        <span className="deck-card__subtitle">{subtitle}</span>
        <h3>{title}</h3>
        <div className="deck-card__progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="deck-card__footer"><span>{progress}% mastered</span><span>{count}</span></div>
      </button>
      <OverflowMenu label={`More options for ${title}`} items={[{ label: "Open in library", onSelect: onClick }, { label: "Add a card", onSelect: onAddCard }]} className="deck-card__menu" />
    </article>
  );
}

function StudyPage({
  dueCards,
  sessionReviewed,
  sessionTotal,
  queueSession,
  showAnswer,
  onShowAnswer,
  onRate,
  onBack,
  onAddCard,
  onContinueReview,
  hasMoreDueCards,
  remainingDueCards,
}: {
  dueCards: Flashcard[];
  sessionReviewed: number;
  sessionTotal: number;
  queueSession: boolean;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onRate: (rating: ReviewRating) => void;
  onBack: () => void;
  onAddCard: () => void;
  onContinueReview: () => void;
  hasMoreDueCards: boolean;
  remainingDueCards: number;
}) {
  const card = dueCards[0];
  const answerRef = useRef<HTMLDivElement>(null);
  const ratingPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAnswer || !card || typeof window === "undefined") return;
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (!isMobile) return;

    let firstFrame = 0;
    let secondFrame = 0;

    const keepAnswerReadable = () => {
      const answer = answerRef.current;
      const ratingPanel = ratingPanelRef.current;
      if (!answer || !ratingPanel) return;

      const answerRect = answer.getBoundingClientRect();
      const ratingRect = ratingPanel.getBoundingClientRect();
      const topInset = 96;
      const bottomInset = ratingRect.top - 18;
      const availableHeight = bottomInset - topInset;
      const answerFits = answerRect.height <= availableHeight;
      let scrollDelta = 0;

      if (!answerFits) {
        scrollDelta = answerRect.top - topInset;
      } else if (answerRect.bottom > bottomInset) {
        scrollDelta = answerRect.bottom - bottomInset;
      } else if (answerRect.top < topInset) {
        scrollDelta = answerRect.top - topInset;
      }

      if (Math.abs(scrollDelta) < 2) return;

      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: scrollDelta, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
    };

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(keepAnswerReadable);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [card?.id, showAnswer]);

  if (!card) {
    return (
      <div className="page-stack study-page study-page--complete">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back to overview</button>
        <div className="complete-card">
          <div className="complete-card__icon" aria-hidden="true"><Sparkles size={28} /></div>
          <span className="page-kicker">{queueSession ? "Selected review complete" : "Review session complete"}</span>
          <h1>{queueSession ? "Queue cleared." : hasMoreDueCards ? "Nice work." : "Alles klar."}</h1>
          <p>{queueSession ? `You reviewed ${sessionReviewed} selected card${sessionReviewed === 1 ? "" : "s"}.` : hasMoreDueCards ? `You reviewed ${sessionReviewed} cards. ${remainingDueCards} more are ready, but they can wait for another short session.` : "You are all caught up for now. Come back when the next review window opens."}</p>
          <div className="complete-card__actions">
            {hasMoreDueCards && !queueSession && <button type="button" className="button button--primary" onClick={onContinueReview}>Continue with next session <ArrowRight size={16} aria-hidden="true" /></button>}
            <button type="button" className={`button ${hasMoreDueCards && !queueSession ? "button--outline" : "button--primary"}`} onClick={onBack}>Back to overview <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="button button--outline" onClick={onAddCard}><Plus size={16} aria-hidden="true" /> Add a card</button>
          </div>
        </div>
      </div>
    );
  }

  const total = Math.max(sessionTotal, dueCards.length, 1);
  const remaining = Math.max(total - sessionReviewed, 0);
  const progress = Math.min(100, Math.round((sessionReviewed / total) * 100));
  const displayWord = `${card.article !== "none" ? `${card.article} ` : ""}${card.german}`;

  return (
    <div className="page-stack study-page">
      <div className="study-topbar">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back to overview</button>
        <div className="study-counter" aria-label={`${sessionReviewed} cards reviewed, ${remaining} cards remaining`}><strong>{sessionReviewed}</strong><span>reviewed · {remaining} left</span></div>
      </div>
      <div className="study-progress-bar" aria-label={`${progress}% of review session`}><span style={{ width: `${progress}%` }} /></div>

      <div className="study-layout">
        <div className={`study-main${showAnswer ? " study-main--answered" : ""}`}>
          <article className={`study-card${showAnswer ? " study-card--answered" : ""}`}>
            <div className="study-card__meta">
              <div className="study-card__source"><BookOpen size={15} aria-hidden="true" /> {card.deck} <span>·</span> {card.lesson}{card.sourcePage && <span> · p. {card.sourcePage}</span>}</div>
              <ArticleBadge article={card.article} partOfSpeech={card.partOfSpeech} />
            </div>
            <div className="study-card__prompt">{showAnswer ? "Can you remember it?" : "What is the meaning of this word?"}</div>
            <div className="study-card__word" style={getStudyWordStyle(card)}>
              {card.article !== "none" && <span className={`article-word article-word--${card.article}`}>{card.article} </span>}
              {card.german}
            </div>
            {card.plural && <div className="study-card__plural"><span>Plural</span> <strong>{card.plural}</strong></div>}
            <div className="study-card__audio"><PronunciationButton text={displayWord} /><button type="button" className="button button--ghost" onClick={() => speakGerman(displayWord, 0.62)}><Volume2 size={14} aria-hidden="true" /> Slow pronunciation</button></div>
            <div ref={answerRef} className={`study-answer${showAnswer ? " study-answer--visible" : ""}`}>
              {showAnswer ? (
                <>
                  <div className="study-answer__translation">{card.translation}</div>
                  {card.example && <div className="study-answer__example"><span>Example</span><p>{card.example}</p><PronunciationButton text={card.example} /></div>}
                  {card.note && <div className="study-answer__note"><Info size={14} aria-hidden="true" /> {card.note}</div>}
                  <VoiceRecorder text={displayWord} />
                </>
              ) : (
                <div className="study-answer__hidden"><Eye size={18} aria-hidden="true" /> Answer hidden until you recall it</div>
              )}
            </div>
            {!showAnswer && (
              <button type="button" className="button button--primary button--large" onClick={onShowAnswer}>
                Show answer
                <Eye size={18} aria-hidden="true" />
              </button>
            )}
          </article>
        </div>

        <aside className="study-aside">
          {showAnswer && (
            <div ref={ratingPanelRef} className="rating-panel">
              <span className="rating-panel__label">How well did you remember it?</span>
              <div className="rating-grid">
                {ratingMeta.map(({ id, label, detail, icon: Icon }) => {
                  const nextInterval = scheduleReview(card, id, getDayKey()).interval;
                  return (
                  <button type="button" className={`rating-button rating-button--${id}`} key={id} onClick={() => onRate(id)}>
                    <Icon size={16} aria-hidden="true" />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <em>{nextInterval} day{nextInterval === 1 ? "" : "s"}</em>
                  </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
      <p className="study-hint"><KeyboardHint>Space</KeyboardHint> to reveal <span>·</span> <KeyboardHint>1–4</KeyboardHint> to rate</p>
    </div>
  );
}

function speakGerman(text: string, rate = 0.86): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function PronunciationButton({ text, slow = false }: { text: string; slow?: boolean }) {
  return (
    <button type="button" className="icon-button icon-button--small pronunciation-button" onClick={() => speakGerman(text, slow ? 0.62 : 0.86)} aria-label={`${slow ? "Play slow" : "Play"} German pronunciation for ${text}`} title={slow ? "Play slowly" : "Play pronunciation"}>
      <Volume2 size={15} aria-hidden="true" />
    </button>
  );
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainder = String(roundedSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function VoiceRecorder({ text }: { text: string }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioTime, setAudioTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not available in this browser.");
      return;
    }
    try {
      setError(null);
      setIsPlaying(false);
      setAudioTime(0);
      setAudioDuration(0);
      setAudioUrl(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        setIsPlaying(false);
        setAudioTime(0);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was not granted. You can still listen to the model pronunciation.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError("Your recording could not be played in this browser.");
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    if (!audioRef.current || !Number.isFinite(nextTime)) return;
    audioRef.current.currentTime = nextTime;
    setAudioTime(nextTime);
  };

  return (
    <div className="voice-recorder">
      <div className="voice-recorder__header">
        <div className="voice-recorder__copy"><strong>Pronunciation check</strong><span>Record yourself saying {text}</span></div>
        <div className="voice-recorder__actions">
          {recording ? <button type="button" className="button button--ghost voice-recorder__stop" onClick={stopRecording}><Square size={13} aria-hidden="true" /> Stop recording</button> : <button type="button" className="button button--ghost voice-recorder__record" onClick={() => void startRecording()}><Mic size={14} aria-hidden="true" /> Record</button>}
          <button type="button" className="button button--ghost voice-recorder__model" onClick={() => speakGerman(text)}><Volume2 size={14} aria-hidden="true" /> Hear model</button>
          {recording && <span className="voice-recorder__status" role="status">Recording...</span>}
        </div>
      </div>
      {audioUrl && <div className="voice-recorder__player">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={(event) => setAudioDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setAudioTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setAudioTime(0); }}
        />
        <button type="button" className="icon-button icon-button--small voice-recorder__play" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Pause your pronunciation recording" : "Play your pronunciation recording"} title={isPlaying ? "Pause recording" : "Play recording"}>
          {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
        <div className="voice-recorder__timeline">
          <input type="range" min="0" max={Math.max(audioDuration, 0.01)} step="0.01" value={Math.min(audioTime, Math.max(audioDuration, 0.01))} onChange={handleSeek} aria-label="Seek in your pronunciation recording" />
          <div><span>Your recording is ready. Compare it with the model.</span><time>{formatAudioTime(audioTime)} / {formatAudioTime(audioDuration)}</time></div>
        </div>
      </div>}
      {error && <small role="status">{error}</small>}
    </div>
  );
}

interface PracticeAttempt {
  cardId: string;
  german: string;
  answer: string;
  correct: boolean;
  xp: number;
}

function shuffleCards(cards: Flashcard[]): Flashcard[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function PracticePage({ cards, level, onAddCard, onAwardXp, onCompleteSession }: { cards: Flashcard[]; level: number; onAddCard: () => void; onAwardXp: (amount: number) => void; onCompleteSession: (cardCount: number) => void }) {
  const [mode, setMode] = useState<PracticeMode>("mixed");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [lastXp, setLastXp] = useState(0);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [sessionModes, setSessionModes] = useState<PracticeMode[]>([]);
  const [sessionAttempts, setSessionAttempts] = useState<PracticeAttempt[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const sessionStartRef = useRef<HTMLButtonElement>(null);

  const eligibleCards = useMemo(() => cards.filter((card) => mode !== "plural" || Boolean(card.plural)), [cards, mode]);
  const card = sessionCards[index] ?? eligibleCards[0];
  const sessionLength = sessionCards.length || getPracticeSessionLength(level, eligibleCards.length);

  useEffect(() => {
    const shuffled = shuffleCards(eligibleCards);
    const nextCards = shuffled.slice(0, getPracticeSessionLength(level, shuffled.length));
    const nextModes = nextCards.map((sessionCard) => {
      if (mode !== "mixed") return mode;
      const options: PracticeMode[] = ["article", "translation", "cloze"];
      if (sessionCard.plural) options.push("plural");
      return options[Math.floor(Math.random() * options.length)] ?? "article";
    });
    setSessionCards(nextCards);
    setSessionModes(nextModes);
    setSessionSeed(Math.floor(Math.random() * 1000));
    setIndex(0);
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(false);
    setScore(0);
    setAttempts(0);
    setSessionXp(0);
    setLastXp(0);
    setSessionAttempts([]);
    setSessionComplete(false);
  }, [mode, eligibleCards]);

  useEffect(() => {
    if (!submitted) return;
    if (sessionComplete) sessionStartRef.current?.focus();
    else nextButtonRef.current?.focus();
  }, [index, submitted, sessionComplete]);

  if (eligibleCards.length === 0) {
    return (
      <div className="page-stack practice-page">
        <section className="page-intro"><div><span className="page-kicker">PRACTICE LAB</span><h1>Practice<span className="title-dot">.</span></h1><p>Add a card with a plural first, then come back for focused practice.</p></div></section>
        <section className="empty-practice"><div className="empty-practice__icon"><ListChecks size={24} aria-hidden="true" /></div><h2>{mode === "plural" ? "No plural cards yet" : "No cards yet"}</h2><p>{mode === "plural" ? "Plural practice needs at least one card with a saved plural form." : "Add a card to start a practice session."}</p><button type="button" className="button button--primary" onClick={onAddCard}><Plus size={16} aria-hidden="true" /> Add a card</button></section>
      </div>
    );
  }

  if (!card) return null;

  const questionMode = sessionModes[index] ?? (mode === "mixed" ? "article" : mode);
  const displayWord = `${card.article !== "none" ? `${card.article} ` : ""}${card.german}`;
  const prompt = questionMode === "article"
    ? `Which article belongs to “${card.german}”?`
    : questionMode === "plural"
      ? `What is the plural of “${displayWord}”?`
      : questionMode === "translation"
        ? `What does “${displayWord}” mean?`
        : "Complete the sentence from your memory.";
  const clozeVariant = (sessionSeed + index) % 11;
  const questionValue = questionMode === "article" ? card.german : questionMode === "cloze" ? makeClozeSentence(card.example, card.german, clozeVariant, card.article) : displayWord;
  const expected = questionMode === "article" ? (card.article === "plural" ? "die" : card.article) : questionMode === "plural" ? card.plural ?? "" : questionMode === "translation" ? card.translation : card.german;
  const expectedLabel = questionMode === "article" ? (card.article === "plural" ? "die · plural" : `${card.article} · ${articleMeta[card.article].detail}`) : questionMode === "plural" ? card.plural ?? "No plural saved" : questionMode === "translation" ? card.translation : card.german;
  const expectedAudio = questionMode === "article" ? expected : expectedLabel;
  const practiceAudio = questionMode === "cloze" ? questionValue.replace("____", card.german) : displayWord;
  const isFinalQuestion = sessionCards.length > 0 && index === sessionCards.length - 1;
  const missedCards = sessionAttempts.filter((attempt) => !attempt.correct).map((attempt) => attempt.german).filter((word, wordIndex, words) => words.indexOf(word) === wordIndex);
  const scrollToPracticeStart = () => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  };

  const startSession = () => {
    const shuffled = shuffleCards(eligibleCards);
    const nextCards = shuffled.slice(0, getPracticeSessionLength(level, shuffled.length));
    const nextModes = nextCards.map((sessionCard) => {
      if (mode !== "mixed") return mode;
      const options: PracticeMode[] = ["article", "translation", "cloze"];
      if (sessionCard.plural) options.push("plural");
      return options[Math.floor(Math.random() * options.length)] ?? "article";
    });
    setSessionCards(nextCards);
    setSessionModes(nextModes);
    setSessionSeed(Math.floor(Math.random() * 1000));
    setIndex(0);
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(false);
    setScore(0);
    setAttempts(0);
    setSessionXp(0);
    setLastXp(0);
    setSessionAttempts([]);
    setSessionComplete(false);
    scrollToPracticeStart();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted || !answer.trim()) return;
    const correct = answerMatches(answer, expected);
    const xpAward = getPracticeXp(correct, isFinalQuestion);
    playPracticeFeedbackSound(correct ? "correct" : "incorrect");
    if (isFinalQuestion) window.setTimeout(() => playPracticeFeedbackSound("complete"), 340);
    onAwardXp(xpAward);
    setIsCorrect(correct);
    setSubmitted(true);
    setLastXp(xpAward);
    setAttempts((current) => current + 1);
    setSessionXp((current) => current + xpAward);
    setSessionAttempts((current) => [...current, { cardId: card.id, german: card.german, answer: answer.trim(), correct, xp: xpAward }]);
    if (correct) setScore((current) => current + 1);
    if (isFinalQuestion) {
      onCompleteSession(sessionCards.length);
      setSessionComplete(true);
    }
  };

  const nextCard = () => {
    if (sessionComplete || isFinalQuestion) return;
    setIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(false);
    setLastXp(0);
    scrollToPracticeStart();
  };

  const handleNextKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    nextCard();
  };

  return (
    <div className="page-stack practice-page">
      <section className="page-intro practice-page__intro">
        <div><span className="page-kicker">PRACTICE LAB</span><h1>Practice<span className="title-dot">.</span></h1><p>{sessionComplete ? "Session report ready. Start another shuffled set when you are ready." : `${sessionLength}-card randomized session. Try first, then use audio when it helps.`}</p></div>
        <div className="practice-score"><Trophy size={16} aria-hidden="true" /><strong>{score}/{attempts}</strong><span>correct</span><em>{sessionXp} XP</em></div>
      </section>

      <section className="practice-toolbar" aria-label="Practice settings">
        <div className="practice-toolbar__summary"><SlidersHorizontal size={17} aria-hidden="true" /><div className="practice-toolbar__copy"><strong>Choose a drill</strong><span>Questions are shuffled each session. Level {level} currently gives you up to {getPracticeSessionLength(level, 999)} cards.</span></div></div>
        <label className="practice-select"><span>Practice mode</span><select value={mode} onChange={(event) => setMode(event.target.value as PracticeMode)}><option value="mixed">Mixed recall</option><option value="article">Article</option><option value="plural">Plural</option><option value="translation">Translation</option><option value="cloze">Sentence gap</option></select><ChevronDown size={15} aria-hidden="true" /></label>
      </section>

      <section className="practice-layout">
        <article className={`practice-card${submitted ? isCorrect ? " practice-card--correct" : " practice-card--wrong" : ""}`}>
          <div className="practice-card__topline"><span>{questionMode === "article" ? "ARTICLE DRILL" : questionMode === "plural" ? "PLURAL DRILL" : questionMode === "translation" ? "MEANING DRILL" : "CLOZE DRILL"}</span><span>{index + 1} / {sessionCards.length || sessionLength}</span></div>
          <p className="practice-card__prompt">{prompt}</p>
          <div className={`practice-card__question${questionMode === "cloze" ? " practice-card__question--cloze" : ""}`}>{questionValue}</div>
          {questionMode !== "article" && <div className="practice-card__audio"><PronunciationButton text={practiceAudio} /><button type="button" className="button button--ghost" onClick={() => speakGerman(practiceAudio, 0.62)}><Volume2 size={14} aria-hidden="true" /> {questionMode === "cloze" ? "Hear sentence" : "Slow pronunciation"}</button>{questionMode === "cloze" && <span>Try first, then listen.</span>}</div>}

          <form className="practice-answer" onSubmit={handleSubmit}>
            <label htmlFor="practice-answer">Your answer</label>
            <div className="practice-answer__row"><input id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={questionMode === "article" ? "der / die / das" : questionMode === "plural" ? "Type the plural" : "Type your answer"} autoComplete="off" disabled={submitted} /><button type="submit" className="button button--primary" disabled={submitted || !answer.trim()}>{submitted ? "Checked" : "Check"} <Check size={16} aria-hidden="true" /></button></div>
          </form>

          {submitted && <div className="practice-result" role="status"><div className="practice-result__icon" aria-hidden="true">{isCorrect ? <CheckCircle2 size={21} /> : <Info size={21} />}</div><div><strong>{isCorrect ? "Sehr gut!" : "Keep this one visible."}</strong><span>{isCorrect ? "That answer matches the card." : `Expected: ${expectedLabel}`}</span><em className="practice-result__xp">+{lastXp} XP</em></div>{!isCorrect && <PronunciationButton text={expectedAudio} />}</div>}
          {submitted && !sessionComplete && <button ref={nextButtonRef} type="button" className="button button--outline practice-next" onClick={nextCard} onKeyDown={handleNextKeyDown} aria-keyshortcuts="Enter"><ArrowRight size={15} aria-hidden="true" /> Next drill</button>}
          {sessionComplete && <section className="practice-summary" role="status">
            <div className="practice-summary__heading"><span className="page-kicker">SESSION COMPLETE</span><h2>{score} of {attempts} correct</h2><p>You earned <strong>{sessionXp} XP</strong> in this shuffled session.</p></div>
            <div className="practice-summary__stats"><div><strong>{score}</strong><span>correct</span></div><div><strong>{attempts - score}</strong><span>another pass</span></div><div><strong>{sessionXp}</strong><span>XP earned</span></div></div>
            {missedCards.length > 0 && <p className="practice-summary__missed"><strong>Keep an eye on:</strong> {missedCards.join(", ")}</p>}
            <button ref={sessionStartRef} type="button" className="button button--primary" onClick={startSession}><RefreshCw size={15} aria-hidden="true" /> Start another shuffled session</button>
          </section>}
        </article>

        <aside className="practice-aside"><div className="practice-aside__heading"><div className="practice-aside__icon"><Languages size={19} aria-hidden="true" /></div><span className="section-eyebrow">ACTIVE RECALL</span></div><h2>Small answer, strong memory.</h2><p>Typing the article, plural, or meaning makes the detail easier to retrieve later in a real conversation.</p><div className="practice-aside__tips"><div><strong>1</strong><span>Try before looking.</span></div><div><strong>2</strong><span>Say it out loud.</span></div><div><strong>3</strong><span>Move on gently.</span></div></div></aside>
      </section>
    </div>
  );
}

function KeyboardHint({ children }: { children: string }) {
  return <kbd>{children}</kbd>;
}

function PdfCandidatesCard({
  candidates,
  sourcePreview,
  loading,
  error,
  onUseCandidate,
  candidateStatuses,
  onCandidateStatusChange,
}: {
  candidates: PdfCandidate[];
  sourcePreview: string;
  loading: boolean;
  error: string | null;
  onUseCandidate: (candidate: PdfCandidate) => void;
  candidateStatuses: Record<string, PdfCandidateStatus>;
  onCandidateStatusChange: (candidateId: string, status: PdfCandidateStatus) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lessonFilter, setLessonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<PdfCandidateStatus>("pending");
  const [page, setPage] = useState(1);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const pageSize = useResponsivePageSize();

  const lessons = [...new Set(candidates.map((candidate) => candidate.lesson).filter((lesson): lesson is string => Boolean(lesson)))];
  const lowConfidenceCount = candidates.filter((candidate) => candidate.confidence === "low").length;
  const qualityCandidates = showLowConfidence
    ? candidates.filter((candidate) => candidate.confidence === "low")
    : candidates.filter((candidate) => candidate.confidence !== "low");
  const normalizedCandidateSearch = candidateSearch.trim().toLocaleLowerCase();
  const statusCounts = qualityCandidates.reduce<Record<PdfCandidateStatus, number>>((counts, candidate) => {
    const status = candidateStatuses[candidate.id] ?? "pending";
    counts[status] += 1;
    return counts;
  }, { pending: 0, accepted: 0, skipped: 0 });
  const filteredCandidates = qualityCandidates.filter((candidate) => (
    (candidateStatuses[candidate.id] ?? "pending") === statusFilter
    && (lessonFilter === "all" || candidate.lesson === lessonFilter)
    && (!normalizedCandidateSearch || [candidate.german, candidate.lesson, candidate.article].some((value) => value?.toLocaleLowerCase().includes(normalizedCandidateSearch)))
  ));
  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const paginatedCandidates = getPageSlice(filteredCandidates, page, pageSize);
  const statusLabels: Record<PdfCandidateStatus, string> = {
    pending: "To review",
    accepted: "Added",
    skipped: "Skipped",
  };
  const emptyMessages: Record<PdfCandidateStatus, string> = {
    pending: "Everything in this import has been reviewed. You can attach a newer PDF or revisit another status.",
    accepted: "No cards have been added from this import yet.",
    skipped: "No suggestions have been skipped.",
  };

  useEffect(() => {
    setLessonFilter("all");
    setStatusFilter("pending");
    setPage(1);
    setShowLowConfidence(false);
    setCandidateSearch("");
  }, [candidates]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, lessonFilter, showLowConfidence, candidateSearch]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  if (!loading && !error && candidates.length === 0 && !sourcePreview) return null;

  return (
    <section className="pdf-import-card">
      <div className="pdf-import-card__heading">
        <div><span className="section-eyebrow">LOCAL PDF IMPORT</span><h2>{loading ? "Reading your PDF..." : "Import inbox"}</h2><p>{loading ? "Text stays in this browser while Deutschly extracts lesson-friendly suggestions." : "Search suggestions, then check the article, meaning, and plural before saving a card."}</p></div>
        <div className="pdf-import-card__count" aria-label={`${statusCounts.pending} suggestions waiting for review`}>{loading ? <RefreshCw size={17} aria-hidden="true" /> : statusCounts.pending}</div>
      </div>

      {loading && <div className="pdf-import-card__loading"><span className="loading-bar" /><span className="loading-bar loading-bar--short" /></div>}
      {error && <div className="pdf-import-card__error" role="alert"><Info size={16} aria-hidden="true" /><span>{error}</span></div>}

      {!loading && candidates.length > 0 && (
        <>
          <div className="pdf-candidate-tabs" aria-label="Imported word status">
            {(Object.keys(statusLabels) as PdfCandidateStatus[]).map((status) => (
              <button
                type="button"
                className={`pdf-candidate-tab${statusFilter === status ? " pdf-candidate-tab--active" : ""}`}
                key={status}
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                <span>{statusLabels[status]}</span>
                <strong>{statusCounts[status]}</strong>
              </button>
            ))}
          </div>
          <div className="pdf-candidate-tools">
            <label className="pdf-candidate-search" htmlFor="pdf-candidate-search"><span>Search imported words</span><input id="pdf-candidate-search" type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search German words" /></label>
            <label className="library-filter" htmlFor="pdf-lesson-filter"><span>Course lesson</span><select id="pdf-lesson-filter" value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="all">All lessons</option>{lessons.map((lesson) => <option value={lesson} key={lesson}>{lesson}</option>)}</select></label>
            <div className="pdf-candidate-tools__meta">
              {lowConfidenceCount > 0 && <label className="filter-check pdf-candidate-quality-toggle"><input type="checkbox" checked={showLowConfidence} onChange={(event) => setShowLowConfidence(event.target.checked)} /><span>{showLowConfidence ? "Only" : "Show"} {lowConfidenceCount} low-confidence {lowConfidenceCount === 1 ? "fragment" : "fragments"}</span></label>}
              <span role="status" aria-live="polite">{filteredCandidates.length} {statusLabels[statusFilter].toLocaleLowerCase()} suggestions</span>
            </div>
          </div>
          <div className="pdf-candidate-list">
            {paginatedCandidates.map((candidate) => (
              <div className={`pdf-candidate-row pdf-candidate-row--${statusFilter}`} key={candidate.id}>
                <ArticleBadge article={candidate.article} compact />
                <div className="pdf-candidate-row__copy">
                  <div className="pdf-candidate-row__title"><strong>{candidate.german}</strong>{candidate.confidence && candidate.confidence !== "high" && <span className={`pdf-candidate-quality-badge pdf-candidate-quality-badge--${candidate.confidence}`}>{candidate.confidence === "low" ? "Low confidence" : "Needs a closer look"}</span>}{statusFilter !== "pending" && <span className={`pdf-candidate-status pdf-candidate-status--${statusFilter}`}>{statusLabels[statusFilter]}</span>}</div>
                  <span>{candidate.lesson || "Menschen A1.1"} · Suggested word</span>
                  {candidate.confidence && candidate.confidence !== "high" && candidate.confidenceReasons && candidate.confidenceReasons.length > 0 && <span className="pdf-candidate-reason">OCR note: {candidate.confidenceReasons.join(" · ")}</span>}
                </div>
                <div className="pdf-candidate-row__actions">
                  {statusFilter === "pending" ? <>
                    <button type="button" className="button button--icon button--outline" onClick={() => onUseCandidate(candidate)} aria-label={`Review and add ${candidate.german}`} title={`Review and add ${candidate.german}`}><Plus size={16} aria-hidden="true" /></button>
                    <button type="button" className="button button--icon button--ghost pdf-candidate-skip" onClick={() => onCandidateStatusChange(candidate.id, "skipped")} aria-label={`Skip ${candidate.german}`} title={`Skip ${candidate.german}`}><X size={17} aria-hidden="true" /></button>
                  </> : <button type="button" className="button button--icon button--ghost" onClick={() => onCandidateStatusChange(candidate.id, "pending")} aria-label={`Move ${candidate.german} back to the inbox`} title={`Move ${candidate.german} back to the inbox`}><RefreshCw size={16} aria-hidden="true" /></button>}
                </div>
              </div>
            ))}
          </div>
          {filteredCandidates.length === 0 && <div className="pdf-import-card__empty"><Info size={17} aria-hidden="true" /><span>{normalizedCandidateSearch ? "No suggestions match that search." : !showLowConfidence && lowConfidenceCount > 0 && qualityCandidates.length === 0 ? "Only low-confidence OCR fragments are hidden. Turn on the option above to review them." : lessonFilter === "all" ? emptyMessages[statusFilter] : "No suggestions were found for this lesson and status."}</span></div>}
          <PaginationControls page={page} pageSize={pageSize} totalItems={filteredCandidates.length} onPageChange={setPage} label="PDF suggestions pagination" />
        </>
      )}

      {!loading && candidates.length > 0 && filteredCandidates.length > 0 && <span className="pdf-import-card__more">Showing page {page} of {totalPages} for {filteredCandidates.length} {statusLabels[statusFilter].toLocaleLowerCase()} suggestions. Review &amp; add opens the card editor so you can check the details before saving.{showLowConfidence ? " Only low-confidence fragments are shown." : lowConfidenceCount > 0 ? ` ${lowConfidenceCount} low-confidence ${lowConfidenceCount === 1 ? "fragment is" : "fragments are"} hidden until you include them.` : ""}</span>}
      {!loading && candidates.length === 0 && !error && <div className="pdf-import-card__empty"><Sparkles size={17} aria-hidden="true" /><span>No article + noun patterns were detected. You can still add cards manually.</span></div>}

      {sourcePreview && (
        <div className={`pdf-preview-details${previewOpen ? " pdf-preview-details--open" : ""}`}>
          <button type="button" className="pdf-preview-details__summary" aria-expanded={previewOpen} aria-controls="pdf-text-preview" onClick={() => setPreviewOpen((current) => !current)}>
            <span>Preview extracted text</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div id="pdf-text-preview" className="pdf-preview-details__content" aria-hidden={!previewOpen} inert={!previewOpen}><pre>{sourcePreview}</pre></div>
        </div>
      )}
    </section>
  );
}

function ResourceShelf() {
  const [open, setOpen] = useState(false);

  return (
    <section className={`resource-shelf${open ? " resource-shelf--open" : ""}`}>
      <button type="button" className="resource-shelf__summary" aria-expanded={open} aria-controls="resource-shelf-links" onClick={() => setOpen((current) => !current)}>
        <BookText size={16} aria-hidden="true" />
        <span><strong>German resource shelf</strong><small>Extra practice and grammar references selected for this course</small></span>
        <ChevronDown className="resource-shelf__chevron" size={15} aria-hidden="true" />
      </button>
      <div id="resource-shelf-links" className={`resource-shelf__content${open ? " resource-shelf__content--open" : ""}`} aria-hidden={!open} inert={!open}>
        <div className="resource-shelf__links">{germanResourceLinks.map((resource) => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer">{resource.label}<ExternalLink size={12} aria-hidden="true" /></a>)}</div>
      </div>
    </section>
  );
}

function formatUsageCountdown(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

function AiQuotaStatus({ endpoint, refreshKey }: { endpoint: string; refreshKey: number }) {
  const [usage, setUsage] = useState<AiUsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const nextUsage = await getAiUsageStatus(endpoint);
        if (!mounted) return;
        setUsage(nextUsage);
        setError(null);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "AI usage is unavailable right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const refreshTimer = window.setInterval(() => void load(), 60_000);
    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, [endpoint, manualRefreshKey, refreshKey]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  const secondsUntil = (value?: string) => {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - now) / 1_000)) : null;
  };
  const windowCountdown = secondsUntil(usage?.resetAt);
  const dailyCountdown = secondsUntil(usage?.dailyResetAt);
  const remaining = usage?.remaining ?? null;
  const limit = usage?.limit ?? null;

  return (
    <div className="ai-usage-status" role="status" aria-live="polite" aria-busy={loading}>
      <span className="ai-usage-status__icon" aria-hidden="true"><Activity size={15} /></span>
      <div className="ai-usage-status__copy">
        <div className="ai-usage-status__heading">
          <strong>AI availability</strong>
          {limit !== null && <span>{remaining} of {limit} requests left</span>}
        </div>
        {usage ? (
          <small>
            {limit !== null ? `This window resets in ${formatUsageCountdown(windowCountdown)}.` : "The local AI bridge controls its own provider limit."}
            {usage.dailyNeurons ? ` Daily pool: ${usage.dailyNeurons.toLocaleString()} neurons; resets in ${formatUsageCountdown(dailyCountdown)}.` : ""}
          </small>
        ) : (
          <small>{loading ? "Checking the AI bridge..." : error || "Usage information is not available."}</small>
        )}
      </div>
      <button type="button" className="icon-button icon-button--small ai-usage-status__refresh" onClick={() => setManualRefreshKey((current) => current + 1)} disabled={loading} aria-label="Refresh AI usage" title="Refresh AI usage">
        <RefreshCw size={14} className={loading ? "spin" : undefined} aria-hidden="true" />
      </button>
    </div>
  );
}

function LibraryPage({
  cards,
  searchQuery,
  sourceFileName,
  sourcePageCount,
  sourceCandidateCount,
  sourcePreview,
  pdfCandidates,
  pdfCandidateStatuses,
  pdfLoading,
  pdfError,
  onSearch,
  onAddCard,
  onAddDatabaseWord,
  onAddWordBankBatch,
  onOpenSync,
  wordBank,
  wordBankInboxItems,
  onWordBankDecision,
  onGenerateWordBatch,
  aiEndpoint,
  onEditCard,
  weakCardsOnly,
  onWeakCardsOnlyChange,
  onPdfUpload,
  onUsePdfCandidate,
  onPdfCandidateStatusChange,
  onExportBackup,
  onImportBackup,
  onBulkDelete,
  onBulkTag,
  onBulkExport,
  onStartReviewQueue,
}: {
  cards: Flashcard[];
  searchQuery: string;
  sourceFileName: string;
  sourcePageCount: number;
  sourceCandidateCount: number;
  sourcePreview: string;
  pdfCandidates: PdfCandidate[];
  pdfCandidateStatuses: Record<string, PdfCandidateStatus>;
  pdfLoading: boolean;
  pdfError: string | null;
  onSearch: (value: string) => void;
  onAddCard: () => void;
  onAddDatabaseWord: (word: GermanWordRecord, wordBankId?: string) => void;
  onAddWordBankBatch: (wordIds: string[]) => void;
  onOpenSync: () => void;
  wordBank: GermanWordRecord[];
  wordBankInboxItems: WordBankInboxItem[];
  onWordBankDecision: (wordId: string, decision: WordBankDecision) => void;
  onGenerateWordBatch: (level: GermanWordBatchLevel, count: number) => Promise<GermanWordRecord[]>;
  aiEndpoint: string;
  onEditCard: (card: Flashcard) => void;
  weakCardsOnly: boolean;
  onWeakCardsOnlyChange: (value: boolean) => void;
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUsePdfCandidate: (candidate: PdfCandidate) => void;
  onPdfCandidateStatusChange: (candidateId: string, status: PdfCandidateStatus) => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkTag: (ids: string[], tag: string) => void;
  onBulkExport: (ids: string[]) => void;
  onStartReviewQueue: (ids: string[]) => void;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [lessonFilter, setLessonFilter] = useState("all");
  const [articleFilter, setArticleFilter] = useState<"all" | Article>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CardStatus>("all");
  const [wordBankQuery, setWordBankQuery] = useState("");
  const [wordBankLevel, setWordBankLevel] = useState<GermanWordBatchLevel>("A1");
  const [wordBankCount, setWordBankCount] = useState("10");
  const [wordBankGenerating, setWordBankGenerating] = useState(false);
  const [wordBankError, setWordBankError] = useState<string | null>(null);
  const [wordBankInboxFilter, setWordBankInboxFilter] = useState<WordBankDecision>("pending");
  const [wordBankInboxPage, setWordBankInboxPage] = useState(1);
  const [savedCardsPage, setSavedCardsPage] = useState(1);
  const [aiUsageRefreshKey, setAiUsageRefreshKey] = useState(0);
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedWordBankIds, setSelectedWordBankIds] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const pageSize = useResponsivePageSize();
  const lessons = [...new Set(cards.map((card) => card.lesson).filter(Boolean))].sort();
  const tags = [...new Set(cards.flatMap((card) => card.tags ?? []))].sort();
  const wordBankSuggestions = useMemo(() => searchGermanWords(wordBankQuery, 6, wordBank), [wordBank, wordBankQuery]);
  const wordBankInboxCounts = useMemo(() => wordBankInboxItems.reduce<Record<WordBankDecision, number>>((counts, item) => {
    counts[item.decision] += 1;
    return counts;
  }, { pending: 0, added: 0, dismissed: 0 }), [wordBankInboxItems]);
  const visibleWordBankItems = useMemo(() => wordBankInboxItems.filter((item) => item.decision === wordBankInboxFilter), [wordBankInboxFilter, wordBankInboxItems]);
  const wordBankInboxTotalPages = Math.max(1, Math.ceil(visibleWordBankItems.length / pageSize));
  const paginatedWordBankItems = getPageSlice(visibleWordBankItems, wordBankInboxPage, pageSize);
  const pendingWordBankIds = useMemo(() => visibleWordBankItems.map(({ word }) => word.id), [visibleWordBankItems]);
  const allPendingWordBankSelected = pendingWordBankIds.length > 0 && pendingWordBankIds.every((id) => selectedWordBankIds.includes(id));
  const wordBankInboxById = useMemo(() => new Map(wordBankInboxItems.map((item) => [item.word.id, item])), [wordBankInboxItems]);
  const savedWordKeys = useMemo(() => new Set(cards.map((card) => normalizeGermanWord(card.german))), [cards]);
  const handleGenerateWordBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (wordBankGenerating) return;

    setWordBankGenerating(true);
    setWordBankError(null);
    try {
      const words = await onGenerateWordBatch(wordBankLevel, Number(wordBankCount));
      if (words.length === 0) setWordBankError("The AI returned no new words. Try another level or run it again later.");
    } catch (error) {
      setWordBankError(error instanceof Error ? error.message : "The AI could not generate new words. Check the sync server and try again.");
    } finally {
      setWordBankGenerating(false);
      setAiUsageRefreshKey((current) => current + 1);
    }
  };
  const filteredCards = cards.filter((card) => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term || [card.german, card.translation, card.example, card.lesson, card.deck, ...(card.tags ?? [])].filter(Boolean).some((value) => value?.toLowerCase().includes(term));
    const matchesLesson = lessonFilter === "all" || card.lesson === lessonFilter;
    const matchesArticle = articleFilter === "all" || card.article === articleFilter;
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    const matchesCheck = !needsCheckOnly || card.verification !== "reference-checked";
    const matchesWeak = !weakCardsOnly || isWeakCard(card);
    return matchesSearch && matchesLesson && matchesArticle && matchesStatus && matchesCheck && matchesWeak;
  });
  const savedCardsTotalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const paginatedCards = getPageSlice(filteredCards, savedCardsPage, pageSize);
  useEffect(() => {
    setWordBankInboxPage(1);
  }, [pageSize, wordBankInboxFilter, wordBankInboxItems.length]);
  useEffect(() => {
    setSavedCardsPage(1);
  }, [articleFilter, lessonFilter, pageSize, searchQuery, statusFilter, needsCheckOnly, weakCardsOnly]);
  useEffect(() => {
    setWordBankInboxPage((current) => Math.min(current, wordBankInboxTotalPages));
  }, [wordBankInboxTotalPages]);
  useEffect(() => {
    setSavedCardsPage((current) => Math.min(current, savedCardsTotalPages));
  }, [savedCardsTotalPages]);
  useEffect(() => {
    const cardIds = new Set(cards.map((card) => card.id));
    setSelectedCardIds((current) => {
      const next = current.filter((id) => cardIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [cards]);
  useEffect(() => {
    const pendingIds = new Set(wordBankInboxItems.filter((item) => item.decision === "pending").map((item) => item.word.id));
    setSelectedWordBankIds((current) => {
      const next = current.filter((id) => pendingIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [wordBankInboxItems]);
  const visibleCardIds = paginatedCards.map((card) => card.id);
  const selectedVisibleCount = visibleCardIds.filter((id) => selectedCardIds.includes(id)).length;
  const allVisibleSelected = visibleCardIds.length > 0 && selectedVisibleCount === visibleCardIds.length;
  const toggleVisibleSelection = () => {
    setSelectedCardIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleCardIds.includes(id))
      : [...current, ...visibleCardIds.filter((id) => !current.includes(id))]);
  };
  const toggleCardSelection = (id: string) => {
    setSelectedCardIds((current) => current.includes(id) ? current.filter((cardId) => cardId !== id) : [...current, id]);
  };
  const toggleWordBankSelection = (id: string) => {
    setSelectedWordBankIds((current) => current.includes(id) ? current.filter((wordId) => wordId !== id) : [...current, id]);
  };
  const toggleAllPendingWordBankSelection = () => {
    setSelectedWordBankIds((current) => allPendingWordBankSelected
      ? current.filter((id) => !pendingWordBankIds.includes(id))
      : [...current, ...pendingWordBankIds.filter((id) => !current.includes(id))]);
  };
  const handleBulkTag = () => {
    const tag = bulkTag.trim();
    if (!tag || selectedCardIds.length === 0) return;
    onBulkTag(selectedCardIds, tag);
    setBulkTag("");
  };
  const hasFilters = lessonFilter !== "all" || articleFilter !== "all" || statusFilter !== "all" || needsCheckOnly || weakCardsOnly;
  const clearFilters = () => {
    setLessonFilter("all");
    setArticleFilter("all");
    setStatusFilter("all");
    setNeedsCheckOnly(false);
    onWeakCardsOnlyChange(false);
  };

  return (
    <div className="page-stack library-page">
      <section className="page-intro page-intro--library">
        <div><span className="page-kicker">YOUR COLLECTION</span><h1>My library<span className="title-dot">.</span></h1><p>Keep your Menschen course cards and personal discoveries in one place.</p></div>
        <button type="button" className="button button--primary" onClick={onAddCard}><Plus size={17} aria-hidden="true" /> Add item</button>
      </section>

      <section className="library-tools">
        <label className="search-box"><Search size={18} aria-hidden="true" /><span className="sr-only">Search cards</span><input type="search" value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search words, translations, lessons..." /></label>
        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="visually-hidden" onChange={onPdfUpload} aria-hidden="true" tabIndex={-1} />
        <div className="library-tools__actions">
          <button type="button" className="button button--outline" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}><UploadCloud size={17} aria-hidden="true" /> {pdfLoading ? "Reading PDF..." : sourceFileName ? "Replace PDF" : "Attach Menschen PDF"}</button>
          <button type="button" className="button button--ghost" onClick={onExportBackup}><Download size={16} aria-hidden="true" /> Export backup</button>
          <input ref={backupInputRef} type="file" accept=".json,application/json" className="visually-hidden" onChange={onImportBackup} aria-hidden="true" tabIndex={-1} />
          <button type="button" className="button button--ghost" onClick={() => backupInputRef.current?.click()}><Upload size={16} aria-hidden="true" /> Import backup</button>
        </div>
      </section>

      <section className="word-bank-card" aria-labelledby="word-bank-title" aria-busy={wordBankGenerating}>
        <div className="word-bank-card__header">
          <div className="word-bank-card__heading">
            <span className="word-bank-card__icon" aria-hidden="true"><Languages size={19} /></span>
            <div>
              <span className="section-eyebrow">CHECKED WORD BANK</span>
              <h2 id="word-bank-title">Find a word to add</h2>
              <p>Browse checked A1 and A2 vocabulary, then review a word before saving it as a flashcard.</p>
            </div>
          </div>
          <span className="word-bank-card__count" role="status" aria-label={`${wordBank.length} words in the checked word bank`}>{wordBank.length} word-bank words</span>
        </div>
        <div className="word-bank-generator">
          <div className="word-bank-generator__copy">
            <span className="word-bank-generator__icon" aria-hidden="true"><Sparkles size={16} /></span>
            <div><strong>Grow the bank with AI</strong><small>Generate common words locally, then review each one before adding a card.</small></div>
          </div>
          <form className="word-bank-generator__form" onSubmit={handleGenerateWordBatch}>
            <label><span>Level</span><select value={wordBankLevel} onChange={(event) => setWordBankLevel(event.target.value as GermanWordBatchLevel)} disabled={wordBankGenerating}><option value="A1">A1</option><option value="A2">A2</option></select></label>
            <label><span>Words</span><select value={wordBankCount} onChange={(event) => setWordBankCount(event.target.value)} disabled={wordBankGenerating}><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label>
            <button type="submit" className="button button--primary" disabled={wordBankGenerating}>{wordBankGenerating ? <><RefreshCw size={15} className="spin" aria-hidden="true" /> Generating...</> : <><Sparkles size={15} aria-hidden="true" /> Generate words</>}</button>
          </form>
        </div>
        {wordBankError && <div className="word-bank-generator__error" role="alert"><Info size={15} aria-hidden="true" /><span>{wordBankError}</span><button type="button" className="text-button" onClick={onOpenSync}><Cloud size={14} aria-hidden="true" /> Set up AI bridge</button></div>}
        <AiQuotaStatus endpoint={aiEndpoint} refreshKey={aiUsageRefreshKey} />
        {wordBankInboxItems.length > 0 && <div className="word-bank-generated word-bank-inbox" aria-live="polite">
          <div className="word-bank-generated__heading"><div><strong>AI word inbox</strong><span>{wordBankInboxCounts.pending} waiting · {wordBankInboxCounts.added} added · {wordBankInboxCounts.dismissed} not for me</span></div><span>{wordBankInboxCounts.pending} waiting</span></div>
          <div className="word-bank-inbox__filters" role="group" aria-label="AI word inbox filters">
            {(["pending", "added", "dismissed"] as WordBankDecision[]).map((decision) => {
              const label = decision === "pending" ? "To review" : decision === "added" ? "Added" : "Not for me";
              return <button type="button" key={decision} className={`word-bank-inbox__filter${wordBankInboxFilter === decision ? " word-bank-inbox__filter--active" : ""}`} onClick={() => setWordBankInboxFilter(decision)} aria-pressed={wordBankInboxFilter === decision}>{label} <span>{wordBankInboxCounts[decision]}</span></button>;
            })}
          </div>
          {wordBankInboxFilter === "pending" && visibleWordBankItems.length > 0 && <div className="word-bank-inbox__bulk">
            <label className="word-bank-inbox__select-all"><input type="checkbox" checked={allPendingWordBankSelected} onChange={toggleAllPendingWordBankSelection} /><span>Select all {visibleWordBankItems.length} waiting</span></label>
            <span className="word-bank-inbox__selected-count" role="status" aria-live="polite">{selectedWordBankIds.length > 0 ? `${selectedWordBankIds.length} selected` : "Choose words to add together"}</span>
            <button type="button" className="button button--outline word-bank-inbox__bulk-add" onClick={() => onAddWordBankBatch(selectedWordBankIds)} disabled={selectedWordBankIds.length === 0}><CheckCircle2 size={15} aria-hidden="true" /> Add selected cards</button>
          </div>}
          {visibleWordBankItems.length > 0 ? <>
          <div className="word-bank-generated__list">
            {paginatedWordBankItems.map(({ word, decision }) => <div className={`word-bank-generated__row word-bank-generated__row--${decision}`} key={word.id}>
              {decision === "pending" ? <label className="word-bank-inbox__select"><input type="checkbox" checked={selectedWordBankIds.includes(word.id)} onChange={() => toggleWordBankSelection(word.id)} /><span className="sr-only">Select {word.german}</span></label> : <span className="word-bank-inbox__select-spacer" aria-hidden="true" />}
              <ArticleBadge article={word.article} partOfSpeech={word.partOfSpeech} compact />
              <div><strong>{word.german}</strong><span>{word.englishMeanings.join(" / ")}</span></div>
              <div className="word-bank-inbox__actions">
                {decision === "pending" && <><button type="button" className="button button--icon button--outline" onClick={() => onAddDatabaseWord(word, word.id)} aria-label={`Add ${word.german} as a flashcard`} title={`Add ${word.german} as a flashcard`}><Plus size={16} aria-hidden="true" /></button><button type="button" className="button button--icon button--ghost" onClick={() => onWordBankDecision(word.id, "dismissed")} aria-label={`Do not add ${word.german}`} title={`Do not add ${word.german}`}><X size={17} aria-hidden="true" /></button></>}
                {decision === "added" && <span className="word-bank-inbox__status"><CheckCircle2 size={14} aria-hidden="true" /> Added to cards</span>}
                {decision === "dismissed" && <button type="button" className="button button--icon button--ghost" onClick={() => onWordBankDecision(word.id, "pending")} aria-label={`Move ${word.german} back to the inbox`} title={`Move ${word.german} back to the inbox`}><RefreshCw size={16} aria-hidden="true" /></button>}
              </div>
            </div>)}
          </div>
          <PaginationControls page={wordBankInboxPage} pageSize={pageSize} totalItems={visibleWordBankItems.length} onPageChange={setWordBankInboxPage} label="AI word inbox pagination" />
          </> : <div className="word-bank-empty"><Info size={16} aria-hidden="true" /><span>{wordBankInboxFilter === "pending" ? "No words waiting for review." : wordBankInboxFilter === "added" ? "No words have been added from this inbox yet." : "No words are marked Not for me."}</span></div>}
        </div>}
        <label className="word-bank-search" htmlFor="word-bank-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search the German word bank</span>
          <input id="word-bank-search" type="search" value={wordBankQuery} onChange={(event) => setWordBankQuery(event.target.value)} placeholder="Search a German word..." />
        </label>
        {wordBankQuery.trim() && (
          wordBankSuggestions.length > 0 ? (
            <div className="word-bank-suggestions" role="listbox" aria-label="German word bank suggestions">
              {wordBankSuggestions.map((word) => {
                const inboxItem = wordBankInboxById.get(word.id);
                const alreadyInLibrary = inboxItem?.decision === "added" || savedWordKeys.has(normalizeGermanWord(word.german));
                return <button type="button" className={`word-bank-suggestion${alreadyInLibrary ? " word-bank-suggestion--added" : ""}`} role="option" aria-label={alreadyInLibrary ? `${word.german} is already in your library` : `Add ${word.german}`} key={word.id} disabled={alreadyInLibrary} onClick={() => { onAddDatabaseWord(word, inboxItem ? word.id : undefined); setWordBankQuery(""); }}>
                  <ArticleBadge article={word.article} partOfSpeech={word.partOfSpeech} compact />
                  <span className="word-bank-suggestion__copy"><strong>{word.german}</strong><small>{word.englishMeanings.join(" / ")}</small>{word.plural && <small>Plural: {word.plural}</small>}{word.source && <small className="word-bank-suggestion__source">{word.source.lesson} · p. {word.source.page}</small>}</span>
                  <span className="word-bank-suggestion__meta">{alreadyInLibrary ? <><Check size={15} aria-hidden="true" /><span>Added</span></> : <><span>{word.level}</span><Plus size={15} aria-hidden="true" /></>}</span>
                </button>;
              })}
            </div>
          ) : <div className="word-bank-empty"><Search size={16} aria-hidden="true" /><span>No matching word yet. Add it manually and use Check card.</span></div>
        )}
      </section>

      <section className="library-filters" aria-label="Filter saved flashcards">
        <div className="library-filters__label"><Filter size={16} aria-hidden="true" /><strong>Saved cards</strong><span aria-label={`${filteredCards.length} of ${cards.length} saved cards shown`}>{filteredCards.length} of {cards.length}</span></div>
        <label className="library-filter"><span>Lesson</span><select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="all">All lessons</option>{lessons.map((lesson) => <option key={lesson} value={lesson}>{lesson}</option>)}</select></label>
        <label className="library-filter"><span>Article</span><select value={articleFilter} onChange={(event) => setArticleFilter(event.target.value as "all" | Article)}><option value="all">All articles</option><option value="der">der</option><option value="die">die</option><option value="das">das</option><option value="plural">die · plural</option><option value="none">No article</option></select></label>
        <label className="library-filter"><span>State</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | CardStatus)}><option value="all">All states</option><option value="new">New</option><option value="learning">Learning</option><option value="review">Review</option></select></label>
        {tags.length > 0 && <span className="library-filters__tags" aria-label={`${tags.length} tags available`}>{tags.slice(0, 3).map((tag) => <button type="button" key={tag} className={`filter-chip${searchQuery.toLowerCase() === tag.toLowerCase() ? " filter-chip--active" : ""}`} onClick={() => onSearch(tag)} aria-pressed={searchQuery.toLowerCase() === tag.toLowerCase()}><Tag size={12} aria-hidden="true" />{tag}</button>)}{tags.length > 3 && <span className="filter-chip__more">+{tags.length - 3}</span>}</span>}
        <label className="filter-check"><input type="checkbox" checked={needsCheckOnly} onChange={(event) => setNeedsCheckOnly(event.target.checked)} /><span>Needs check</span></label>
        <label className="filter-check"><input type="checkbox" checked={weakCardsOnly} onChange={(event) => onWeakCardsOnlyChange(event.target.checked)} /><span>Weak cards</span></label>
        {hasFilters && <button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}
      </section>

      <section className={`library-bulk-toolbar${selectedCardIds.length > 0 ? " library-bulk-toolbar--active" : ""}`} aria-label="Bulk card actions">
        <label className="library-bulk-toolbar__select"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} disabled={filteredCards.length === 0} /><span>Select visible</span></label>
        <span className="library-bulk-toolbar__count" role="status" aria-live="polite">{selectedCardIds.length > 0 ? `${selectedCardIds.length} selected` : "Select cards to manage them together"}</span>
        {selectedCardIds.length > 0 && <div className="library-bulk-toolbar__actions">
          <label className="library-bulk-tag" htmlFor="bulk-card-tag"><span className="sr-only">Tag selected cards</span><input id="bulk-card-tag" value={bulkTag} onChange={(event) => setBulkTag(event.target.value.slice(0, 24))} placeholder="Add a tag" maxLength={24} /></label>
          <button type="button" className="button button--outline" onClick={handleBulkTag} disabled={!bulkTag.trim()}>Add tag</button>
          <button type="button" className="button button--primary" onClick={() => onStartReviewQueue(selectedCardIds)}><Play size={15} aria-hidden="true" /> Review selected</button>
          <button type="button" className="button button--outline" onClick={() => onBulkExport(selectedCardIds)}><Download size={15} aria-hidden="true" /> Export selected</button>
          <button type="button" className="button button--ghost settings-danger-action" onClick={() => onBulkDelete(selectedCardIds)}><Trash2 size={15} aria-hidden="true" /> Delete selected</button>
          <button type="button" className="text-button" onClick={() => setSelectedCardIds([])}>Clear selection</button>
        </div>}
      </section>

      <section className="library-source-card">
        <div className="library-source-card__icon" aria-hidden="true"><FileText size={22} /></div>
        <div className="library-source-card__copy"><span className="section-eyebrow">COURSE SOURCE</span><h2>Menschen A1.1</h2><p>{sourceFileName ? `${sourceFileName} attached · text extracted locally for lesson-based card creation` : "Attach your PDF to keep lesson references beside every card."}</p></div>
        <div className="library-source-card__stats"><div><strong>12</strong><span>lessons</span></div><div><strong>{sourcePageCount || "n/a"}</strong><span>PDF pages</span></div><div><strong>{sourceCandidateCount || "n/a"}</strong><span>suggestions</span></div></div>
      </section>

      {lessons.length > 0 && <section className="lesson-strip" aria-label="Menschen lessons">
        <div className="lesson-strip__heading"><BookText size={17} aria-hidden="true" /><div><span className="section-eyebrow">COURSE MAP</span><h2>Jump into a lesson</h2></div></div>
        <div className="lesson-strip__items">
          <button type="button" className={`lesson-chip${lessonFilter === "all" ? " lesson-chip--active" : ""}`} onClick={() => setLessonFilter("all")} aria-pressed={lessonFilter === "all"}><strong>All</strong><span>{cards.length} cards</span></button>
          {lessons.map((lesson) => <button type="button" className={`lesson-chip${lessonFilter === lesson ? " lesson-chip--active" : ""}`} key={lesson} onClick={() => setLessonFilter(lesson)} aria-pressed={lessonFilter === lesson}><strong>{lesson}</strong><span>{cards.filter((card) => card.lesson === lesson).length} cards</span></button>)}
        </div>
      </section>}

      <ResourceShelf />

      <PdfCandidatesCard candidates={pdfCandidates} sourcePreview={sourcePreview} loading={pdfLoading} error={pdfError} onUseCandidate={onUsePdfCandidate} candidateStatuses={pdfCandidateStatuses} onCandidateStatusChange={onPdfCandidateStatusChange} />

      <section className="library-list-card">
        <div className="library-list-card__heading"><div><span className="section-eyebrow">ALL CARDS</span><h2>{filteredCards.length} cards</h2></div><span className="muted-label">Article colors are always labeled</span></div>
        <div className="library-table" role="table" aria-label="Flashcard library">
          <div className="library-table__header" role="row"><span aria-hidden="true" /><span>Word</span><span>Meaning</span><span>Lesson</span><span>State</span><span aria-hidden="true" /></div>
          {paginatedCards.map((card) => (
            <div className="library-row" role="row" key={card.id}>
              <label className="library-row__select"><span className="sr-only">Select {card.german}</span><input type="checkbox" checked={selectedCardIds.includes(card.id)} onChange={() => toggleCardSelection(card.id)} /></label>
              <div className="library-row__word"><ArticleBadge article={card.article} partOfSpeech={card.partOfSpeech} compact /><strong>{card.german}</strong>{card.plural && <small>plural: {card.plural}</small>}{card.tags && card.tags.length > 0 && <small className="library-row__tags">{card.tags.join(" · ")}</small>}{card.verification === "unverified" && <small className="verification-note">needs reference check</small>}</div>
              <span className="library-row__translation">{card.translation}</span>
              <span className="library-row__lesson">{card.lesson}{card.sourcePage && <small>p. {card.sourcePage}</small>}</span>
              <span className={`status-pill status-pill--${card.status}`}>{card.status === "review" ? "Review" : card.status === "learning" ? "Learning" : "New"}</span>
              <button type="button" className="icon-button icon-button--small" onClick={() => onEditCard(card)} aria-label={`Edit ${card.german}`} title={`Edit ${card.german}`}><Pencil size={15} aria-hidden="true" /></button>
            </div>
          ))}
          {filteredCards.length === 0 && <div className="empty-library"><Search size={20} aria-hidden="true" /><strong>No cards found</strong><span>Try a different word or lesson.</span></div>}
        </div>
        <PaginationControls page={savedCardsPage} pageSize={pageSize} totalItems={filteredCards.length} onPageChange={setSavedCardsPage} label="Saved cards pagination" />
      </section>
    </div>
  );
}

function ResetProgressModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel reset-progress-modal" role="dialog" aria-modal="true" aria-labelledby="reset-progress-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">FRESH START</span><h2 id="reset-progress-title">Start from zero?</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close reset progress dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Keep your cards and PDF, but clear the learning history so you can begin the review journey again.</p>
        <div className="reset-progress-list">
          <div><RefreshCw size={16} aria-hidden="true" /><span>Cards become new and are due today.</span></div>
          <div><Target size={16} aria-hidden="true" /><span>XP, streaks, mastery, achievements, and weekly activity return to zero.</span></div>
        </div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> Your library and reminder settings stay saved.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={onConfirm}>Reset progress</button></div></div>
      </section>
    </div>
  );
}

function DeleteCardModal({ card, onClose, onConfirm }: { card: Flashcard; onClose: () => void; onConfirm: () => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel delete-card-modal" role="dialog" aria-modal="true" aria-labelledby="delete-card-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">REMOVE FROM LIBRARY</span><h2 id="delete-card-title">Delete this card?</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close delete card dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">This removes the card and its review history from your library. You can add it again later, but this action cannot be undone here.</p>
        <div className="delete-card-summary"><ArticleBadge article={card.article} partOfSpeech={card.partOfSpeech} compact /><div className="delete-card-summary__copy"><strong>{card.german}</strong><span>{card.translation}</span></div></div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> Your other cards and course PDF stay saved.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--danger" onClick={onConfirm}><Trash2 size={15} aria-hidden="true" /> Delete card</button></div></div>
      </section>
    </div>
  );
}

function BulkDeleteModal({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel bulk-delete-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">BULK ACTION</span><h2 id="bulk-delete-title">Delete {count} cards?</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close bulk delete dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">This removes the selected cards and their review history. You can restore them for a short time with Undo.</p>
        <div className="delete-card-summary bulk-delete-summary"><div className="bulk-delete-summary__icon" aria-hidden="true"><Trash2 size={18} /></div><div className="delete-card-summary__copy"><strong>{count} selected cards</strong><span>Your other cards and course PDF stay saved.</span></div></div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> This action changes your library.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--danger" onClick={onConfirm}><Trash2 size={15} aria-hidden="true" /> Delete cards</button></div></div>
      </section>
    </div>
  );
}

function DeleteAccountModal({ email, busy, error, onClose, onConfirm }: { email: string; busy: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={panelRef} className="modal-panel delete-account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-intro">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">CLOUD ACCOUNT</span><h2 id="delete-account-title">Delete your account?</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close delete account dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p id="delete-account-intro" className="modal-panel__intro">This permanently deletes the Firebase account and its cloud data for <strong>{email || "this account"}</strong>. Cards saved locally on this device will stay here.</p>
        <div className="delete-account-warning" role="alert"><Trash2 size={16} aria-hidden="true" /><span>Export a backup first if you may want these cards later. Account deletion cannot be undone.</span></div>
        {error && <div className="onboarding-modal__error firebase-account__error" role="alert"><Info size={15} aria-hidden="true" /> {error}</div>}
        <div className="modal-panel__footer"><span><Cloud size={15} aria-hidden="true" /> Cloud data only</span><div><button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="button button--danger" onClick={onConfirm} disabled={busy}><Trash2 size={15} aria-hidden="true" /> {busy ? "Deleting..." : "Delete account"}</button></div></div>
      </section>
    </div>
  );
}

function FirebaseMergeModal({ localCardCount, remoteCardCount, remoteProfileName, busy, onClose, onResolve }: { localCardCount: number; remoteCardCount: number; remoteProfileName: string; busy: boolean; onClose: () => void; onResolve: (strategy: FirebaseSyncStrategy) => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={panelRef} className="modal-panel firebase-merge-modal" role="dialog" aria-modal="true" aria-labelledby="firebase-merge-title" aria-describedby="firebase-merge-intro">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">ACCOUNT CONNECTED</span><h2 id="firebase-merge-title">Choose your card data</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close data choice dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p id="firebase-merge-intro" className="modal-panel__intro">This Google account already has saved data. Choose what should happen before Deutschly syncs it.</p>
        <div className="firebase-merge-summary"><div><span>This device</span><strong>{localCardCount} cards</strong></div><div><span>{remoteProfileName || "Google account"}</span><strong>{remoteCardCount} cards</strong></div></div>
        <div className="firebase-merge-options" role="group" aria-label="Choose how to sync card data">
          <button type="button" className="firebase-merge-option firebase-merge-option--primary" onClick={() => onResolve("merge")} disabled={busy}><span><strong>Merge both</strong><small>Keep unique cards and the latest progress from both places.</small></span><ArrowRight size={16} aria-hidden="true" /></button>
          <button type="button" className="firebase-merge-option" onClick={() => onResolve("local")} disabled={busy}><span><strong>Keep this device</strong><small>Use local data and replace the account copy.</small></span><ArrowRight size={16} aria-hidden="true" /></button>
          <button type="button" className="firebase-merge-option" onClick={() => onResolve("remote")} disabled={busy}><span><strong>Use Google data</strong><small>Replace local data with the account copy.</small></span><ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> You can change local cards later.</span><div><button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>Not now</button></div></div>
      </section>
    </div>
  );
}

interface ProgressBreakdownStats {
  total: number;
  due: number;
  inReview: number;
  mastery: number;
}

const progressArticleOrder: Article[] = ["der", "die", "das", "plural", "none"];

function compareLessonLabels(first: string, second: string): number {
  const firstNumber = Number(first.match(/\d+/)?.[0]);
  const secondNumber = Number(second.match(/\d+/)?.[0]);
  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber) && firstNumber !== secondNumber) return firstNumber - secondNumber;
  if (Number.isFinite(firstNumber) !== Number.isFinite(secondNumber)) return Number.isFinite(firstNumber) ? -1 : 1;
  return first.localeCompare(second);
}

function getProgressBreakdownStats(cards: Flashcard[], todayKey: string): ProgressBreakdownStats {
  if (cards.length === 0) return { total: 0, due: 0, inReview: 0, mastery: 0 };
  return {
    total: cards.length,
    due: cards.filter((card) => card.due <= todayKey).length,
    inReview: cards.filter((card) => card.status === "review").length,
    mastery: Math.round(cards.reduce((sum, card) => sum + getCardMastery(card), 0) / cards.length),
  };
}

function ProgressBreakdownSection({ eyebrow, title, icon: Icon, id, children }: { eyebrow: string; title: string; icon: LucideIcon; id: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <article className={`progress-breakdown-card${open ? " progress-breakdown-card--open" : ""}`}>
      <button type="button" className="progress-breakdown-card__heading" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}>
        <span><span className="section-eyebrow">{eyebrow}</span><span className="progress-breakdown-card__title" role="heading" aria-level={2}>{title}</span></span>
        <span className="progress-breakdown-card__toggle" aria-hidden="true"><Icon size={19} /><ChevronDown size={16} /></span>
      </button>
      <div id={id} className="progress-breakdown-card__body" aria-hidden={!open} inert={!open}>
        <div>{children}</div>
      </div>
    </article>
  );
}

function ProgressDisclosureSection({ eyebrow, title, id, open, onToggle, className = "", collapsedPreview, children }: { eyebrow: string; title: string; id: string; open: boolean; onToggle: () => void; className?: string; collapsedPreview?: ReactNode; children: ReactNode }) {
  return (
    <article className={`progress-disclosure-card${className ? ` ${className}` : ""}${open ? " progress-disclosure-card--open" : ""}`}>
      <button type="button" className="progress-disclosure-card__heading" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span><span className="section-eyebrow">{eyebrow}</span><span className="progress-disclosure-card__title" role="heading" aria-level={2}>{title}</span></span>
        <span className="progress-disclosure-card__toggle" aria-hidden="true"><ChevronDown size={18} /></span>
      </button>
      {!open && collapsedPreview && <div className="progress-disclosure-card__preview">{collapsedPreview}</div>}
      <div id={id} className="progress-disclosure-card__body" aria-hidden={!open} inert={!open}>
        <div>{children}</div>
      </div>
    </article>
  );
}

interface AchievementDisplayItem extends AchievementDefinition {
  unlocked: boolean;
  progress: number;
  unlockedAt?: string;
}

function getAchievementProgress(id: string, state: AppState): number {
  if (state.achievements.includes(id)) return 100;
  if (id === "first-review") return state.totalReviews > 0 ? 100 : 0;
  if (id === "week-streak") return Math.min(100, Math.round((state.bestStreak / 7) * 100));
  if (id === "daily-goal") return Math.min(100, Math.round((state.reviewsToday / Math.max(1, state.dailyGoal)) * 100));
  if (id === "xp-1500") return Math.min(100, Math.round((state.xp / 1500) * 100));
  return 0;
}

function formatAchievementDate(value?: string): string {
  if (!value) return "Not unlocked yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unlocked";
  return `Unlocked ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function applyAchievementUnlocks(state: AppState, candidateIds: string[], unlockedAt: string): AppState {
  const achievements = [...state.achievements];
  const achievementUnlockedAt = { ...state.achievementUnlockedAt };
  let xp = state.xp;

  candidateIds.forEach((id) => {
    if (achievements.includes(id)) return;
    const definition = getAchievementDefinition(id);
    if (!definition) return;
    achievements.push(id);
    achievementUnlockedAt[id] = unlockedAt;
    xp += definition.rewardXp;
  });

  return {
    ...state,
    xp,
    achievements: achievements.slice(0, 24),
    achievementUnlockedAt,
  };
}

function getNewAchievementDefinitions(existingIds: string[], candidateIds: string[]): AchievementDefinition[] {
  return candidateIds
    .filter((id, index, ids) => ids.indexOf(id) === index && !existingIds.includes(id))
    .map((id) => getAchievementDefinition(id))
    .filter((definition): definition is AchievementDefinition => Boolean(definition));
}

function formatAchievementUnlocks(achievements: AchievementDefinition[]): string {
  if (achievements.length === 0) return "";
  const rewardXp = achievements.reduce((sum, achievement) => sum + achievement.rewardXp, 0);
  return `Achievement unlocked: ${achievements.map((achievement) => achievement.title).join(", ")} · +${rewardXp} XP`;
}

function AchievementDetailsModal({ achievement, onClose }: { achievement: AchievementDisplayItem; onClose: () => void }) {
  const panelRef = useModalFocus<HTMLElement>(onClose);
  const imageURL = `${import.meta.env.BASE_URL}${achievement.image}`;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel achievement-details-modal" role="dialog" aria-modal="true" aria-labelledby="achievement-details-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">ACHIEVEMENT</span><h2 id="achievement-details-title">{achievement.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close achievement details" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <div className={`achievement-details${achievement.unlocked ? " achievement-details--unlocked" : " achievement-details--locked"}`}>
          <div className="achievement-details__badge"><img src={imageURL} alt="" /></div>
          <div className="achievement-details__copy"><span className="achievement-item__status">{achievement.unlocked ? "Unlocked" : "Locked"}</span><p>{achievement.detail}</p><strong>{achievement.requirement}</strong><small>{achievement.unlocked ? formatAchievementDate(achievement.unlockedAt) : `${achievement.progress}% complete`}</small></div>
        </div>
        <div className="achievement-details__reward"><Sparkles size={16} aria-hidden="true" /><span><strong>+{achievement.rewardXp} XP reward</strong><small>{achievement.unlocked ? "This reward is already part of your progress." : "Keep reviewing to unlock this reward."}</small></span></div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> Small milestones keep the habit visible.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Close</button></div></div>
      </section>
    </div>
  );
}

function ProgressPage({ state, onViewWeakCards, onAdjustReminder, onStartReview }: { state: AppState; onViewWeakCards: () => void; onAdjustReminder: () => void; onStartReview: () => void }) {
  const todayKey = getDayKey();
  const maxValue = Math.max(...state.weeklyReviews, 1);
  const average = Math.round(state.weeklyReviews.reduce((sum, value) => sum + value, 0) / state.weeklyReviews.length);
  const level = getLevelProgress(state.xp);
  const currentPracticeLength = getPracticeSessionLength(level.level, 999);
  const nextPracticeLength = getPracticeSessionLength(level.level + 1, 999);
  const accuracy = state.totalReviews > 0 ? Math.round((state.correctReviews / state.totalReviews) * 100) : 0;
  const mastery = Math.round(state.cards.reduce((sum, card) => sum + getCardMastery(card), 0) / Math.max(state.cards.length, 1));
  const weakCards = state.cards.filter(isWeakCard).length;
  const newCards = state.cards.filter((card) => card.status === "new").length;
  const isFreshStart = state.cards.length > 0 && newCards === state.cards.length;
  const masteryTitle = state.cards.length === 0 ? "Build your deck" : isFreshStart ? "Fresh start" : mastery >= 70 ? "Strong foundations" : "Keep building";
  const masteryMessage = state.cards.length === 0
    ? "Add your first card to start building mastery."
    : isFreshStart
      ? `${newCards} cards are ready for a fresh start.`
      : weakCards > 0
        ? `${weakCards} card${weakCards === 1 ? "" : "s"} could use another gentle pass.`
        : "Your cards are holding steady.";
  const lessonStats = [...new Set(state.cards.map((card) => card.lesson).filter(Boolean))]
    .sort(compareLessonLabels)
    .map((lesson) => ({ lesson, stats: getProgressBreakdownStats(state.cards.filter((card) => card.lesson === lesson), todayKey) }));
  const articleStats = progressArticleOrder
    .map((article) => ({ article, stats: getProgressBreakdownStats(state.cards.filter((card) => card.article === article), todayKey) }))
    .filter(({ stats }) => stats.total > 0);
  const [achievementsOpen, setAchievementsOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | null>(null);
  const achievementItems: AchievementDisplayItem[] = [
    ...achievementCatalog.map((achievement) => ({ ...achievement, unlocked: state.achievements.includes(achievement.id), progress: getAchievementProgress(achievement.id, state), unlockedAt: state.achievementUnlockedAt[achievement.id] })),
    ...state.achievements
      .filter((achievement) => !achievementCatalog.some((item) => item.id === achievement))
      .map((achievement) => ({ id: achievement as AchievementId, title: "New milestone", detail: achievement, requirement: "Completed legacy milestone", rewardXp: 0, image: "achievements/momentum-maker.webp", unlocked: true, progress: 100, unlockedAt: state.achievementUnlockedAt[achievement] })),
  ];
  const unlockedAchievements = achievementItems.filter((achievement) => achievement.unlocked).length;
  const achievementPercent = achievementItems.length > 0 ? Math.round((unlockedAchievements / achievementItems.length) * 100) : 0;
  const selectedAchievement = achievementItems.find((achievement) => achievement.id === selectedAchievementId);
  const nextAchievement = achievementItems.find((achievement) => !achievement.unlocked);
  const weeklyTotal = state.weeklyReviews.reduce((sum, value) => sum + value, 0);
  const activeReviewDays = state.weeklyReviews.filter((value) => value > 0).length;
  const peakReview = Math.max(...state.weeklyReviews, 0);
  const achievementPreview = <div className="achievement-collapsed-preview"><div><strong>{unlockedAchievements} of {achievementItems.length} unlocked</strong><span>{nextAchievement ? `Next: ${nextAchievement.title}` : "All milestones complete"}</span></div><div className="achievement-collapsed-preview__progress" aria-hidden="true"><span style={{ width: `${achievementPercent}%` }} /></div></div>;
  const activityPreview = <div className="activity-preview"><div className="activity-preview__copy"><strong>{weeklyTotal} reviews this week</strong><span>{activeReviewDays} active day{activeReviewDays === 1 ? "" : "s"} · peak {peakReview}</span></div><div className="activity-preview__bars" aria-hidden="true">{state.weeklyReviews.map((value, index) => <span key={`${value}-${index}`} style={{ height: `${Math.max(8, Math.round((value / Math.max(peakReview, 1)) * 100))}%` }} />)}</div></div>;
  return (
    <div className="page-stack progress-page">
      <section className="page-intro"><div><span className="page-kicker">KEEP THE MOMENTUM</span><h1>Your progress<span className="title-dot">.</span></h1><p>Consistency beats cramming. Here is the shape of your week.</p></div><div className="progress-page__actions"><div className="progress-summary"><span>Weekly average</span><strong>{average} reviews</strong></div></div></section>
      <section className="progress-level-grid">
        <article className="level-card"><div className="level-card__topline"><div className="level-card__icon"><Medal size={18} aria-hidden="true" /></div><span>LEARNER LEVEL</span><strong>Level {level.level}</strong></div><div className="level-card__score"><b>{state.xp}</b><span>XP earned</span></div><div className="level-progress" aria-label={`${level.percent}% to level ${level.level + 1}`}><span style={{ width: `${level.percent}%` }} /></div><div className="level-card__footer"><span>{level.current} / {level.needed} XP to next level</span><span>{level.percent}%</span></div><div className="level-card__reward"><Sparkles size={15} aria-hidden="true" /><span><strong>Up to {currentPracticeLength} cards per session</strong><small>{nextAchievement ? `${nextAchievement.title} is the next milestone. Level ${level.level + 1} unlocks up to ${nextPracticeLength} shuffled cards.` : `Level ${level.level + 1} unlocks sessions of up to ${nextPracticeLength} shuffled cards.`}</small></span></div></article>
        <ProgressDisclosureSection eyebrow="SMALL WINS" title="Achievements" id="progress-achievements" open={achievementsOpen} onToggle={() => setAchievementsOpen((current) => !current)} className="achievement-card" collapsedPreview={achievementPreview}>
          <div className="achievement-summary"><div><strong>{unlockedAchievements} of {achievementItems.length} unlocked</strong><span>Every review can unlock a small milestone.</span></div><strong>{achievementPercent}%</strong></div>
          <div className="achievement-progress" role="progressbar" aria-label="Achievements unlocked" aria-valuemin={0} aria-valuemax={achievementItems.length} aria-valuenow={unlockedAchievements}><span style={{ width: `${achievementPercent}%` }} /></div>
          <div className="achievement-list">
            {achievementItems.map((achievement) => (
              <button type="button" className={`achievement-item${achievement.unlocked ? " achievement-item--unlocked" : " achievement-item--locked"}`} key={achievement.id} onClick={() => setSelectedAchievementId(achievement.id)} aria-haspopup="dialog" aria-label={`${achievement.title}: ${achievement.unlocked ? "unlocked" : "locked"}`}>
                <span className="achievement-item__badge" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}${achievement.image}`} alt="" /></span>
                <span className="achievement-item__copy"><strong>{achievement.title}</strong><small>{achievement.detail}</small></span>
                <span className="achievement-item__status">{achievement.unlocked ? "Unlocked" : `${achievement.progress}%`}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </ProgressDisclosureSection>
      </section>
      <section className="progress-overview-grid">
        <ProgressDisclosureSection eyebrow="LAST 7 DAYS" title="Review activity" id="progress-review-activity" open={activityOpen} onToggle={() => setActivityOpen((current) => !current)} className="progress-chart-card" collapsedPreview={activityPreview}>
          <div className="large-chart" aria-label="Review activity for the last seven days">
            {state.weeklyReviews.map((value, index) => (
              <div className={`large-chart__column${index === state.weeklyReviews.length - 1 ? " large-chart__column--today" : ""}`} key={`${value}-${index}`}><div className="large-chart__value">{value}</div><div className="large-chart__track"><span style={{ height: `${Math.max(8, Math.round((value / maxValue) * 100))}%` }} /></div><span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span></div>
            ))}
          </div>
        </ProgressDisclosureSection>
        <article className="mastery-card">
          <div className="mastery-card__ring" style={{ "--mastery": `${mastery}%` } as CSSProperties} role="img" aria-label={`${mastery}% course mastery`}><div><strong>{mastery}%</strong><span>mastery</span></div></div>
          <div><span className="section-eyebrow">COURSE MASTERY</span><h2>{masteryTitle}</h2><p>{masteryMessage}</p>{weakCards > 0 ? <button type="button" className="text-button" onClick={onViewWeakCards}>See weak cards <ChevronRight size={16} aria-hidden="true" /></button> : isFreshStart ? <button type="button" className="text-button" onClick={onStartReview}>Start your first review <ChevronRight size={16} aria-hidden="true" /></button> : <span className="mastery-card__status">Nothing needs extra attention right now.</span>}</div>
        </article>
      </section>
      <section className="progress-breakdown-grid" aria-label="Progress by lesson and article">
        <ProgressBreakdownSection eyebrow="COURSE MAP" title="Progress by lesson" icon={BookText} id="progress-by-lesson">
          <p className="progress-breakdown-card__intro">See which Menschen lessons are becoming reliable and which still need another pass.</p>
          <div className="progress-breakdown-list">
            {lessonStats.length > 0 ? lessonStats.map(({ lesson, stats }) => (
              <div className="progress-breakdown-row" key={lesson}>
                <div className="progress-breakdown-row__label"><strong>{lesson}</strong><span>{stats.total} cards · {stats.inReview} in review · {stats.due} due</span></div>
                <div className="progress-breakdown-row__value"><strong>{stats.mastery}%</strong><span>mastery</span></div>
                <div className="progress-breakdown-row__bar" role="progressbar" aria-label={`${lesson} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.mastery}><span style={{ width: `${stats.mastery}%` }} /></div>
              </div>
            )) : <div className="progress-breakdown-empty"><Info size={17} aria-hidden="true" /><span>Add cards to see lesson progress.</span></div>}
          </div>
        </ProgressBreakdownSection>
        <ProgressBreakdownSection eyebrow="ARTICLE COLORS" title="Progress by article" icon={Languages} id="progress-by-article">
          <p className="progress-breakdown-card__intro">Your recall balance across der, die, das, plural, and no-article items.</p>
          <div className="progress-breakdown-list">
            {articleStats.length > 0 ? articleStats.map(({ article, stats }) => (
              <div className="progress-breakdown-row" key={article}>
                <div className="progress-breakdown-row__label"><div className="progress-breakdown-row__title"><ArticleBadge article={article} compact /><strong>{article === "plural" ? "Plural" : article === "none" ? "No article" : article}</strong></div><span>{stats.total} cards · {stats.inReview} in review · {stats.due} due</span></div>
                <div className="progress-breakdown-row__value"><strong>{stats.mastery}%</strong><span>mastery</span></div>
                <div className="progress-breakdown-row__bar" role="progressbar" aria-label={`${article === "none" ? "No article" : article} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.mastery}><span style={{ width: `${stats.mastery}%` }} /></div>
              </div>
            )) : <div className="progress-breakdown-empty"><Info size={17} aria-hidden="true" /><span>Add cards to see article progress.</span></div>}
          </div>
        </ProgressBreakdownSection>
      </section>
      <section className="progress-metrics">
        <StatCard icon={Flame} label="Longest streak" value={`${state.bestStreak} days`} detail={`Current streak · ${state.streak} days`} tone="orange" />
        <StatCard icon={CheckCircle2} label="Recall accuracy" value={`${accuracy}%`} detail={`${state.correctReviews} of ${state.totalReviews} answers`} tone="mint" />
        <StatCard icon={Target} label="Goal completion" value={`${Math.min(100, Math.round((state.reviewsToday / state.dailyGoal) * 100))}%`} detail={`${state.reviewsToday} of ${state.dailyGoal} today`} tone="indigo" />
      </section>
      <article className="insight-card"><div className="insight-card__icon" aria-hidden="true"><Sparkles size={19} /></div><div><span className="section-eyebrow">A SMALL INSIGHT</span><h2>Your best study window is early evening.</h2><p>You remember 22% more cards when you review within two hours of your reminder.</p></div><button type="button" className="button button--outline" onClick={onAdjustReminder}>Adjust reminder <ArrowRight size={16} aria-hidden="true" /></button></article>
      {selectedAchievement && <AchievementDetailsModal achievement={selectedAchievement} onClose={() => setSelectedAchievementId(null)} />}
    </div>
  );
}

function CardCheckPanel({ result, referenceChecked, onReferenceChecked, onApplySuggestion, aiReview, aiError, aiChecking, onAiCheck, onApplyAiReview }: {
  result: CardCheckResult;
  referenceChecked: boolean;
  onReferenceChecked: (checked: boolean) => void;
  onApplySuggestion: () => void;
  aiReview: GeminiCardReview | null;
  aiError: string | null;
  aiChecking: boolean;
  onAiCheck: () => void;
  onApplyAiReview: () => void;
}) {
  const blocked = result.match?.type === "exact";

  return (
    <section className={`card-check${blocked ? " card-check--blocked" : ""}`} aria-live="polite">
      <div className="card-check__heading">
        <div>
          <span className="section-eyebrow">CARD CHECK</span>
          <h3>{blocked ? "Duplicate found" : "Review before adding"}</h3>
        </div>
        {blocked ? <X size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
      </div>

      <div className="card-check__preview">
        <div className="card-check__preview-line">
          <ArticleBadge article={result.draft.article} compact />
          <strong>{result.draft.german}</strong>
        </div>
        <span>{result.draft.translation}</span>
        {result.draft.plural && <small>Plural: {result.draft.plural}</small>}
      </div>

      <div className="card-check__items">
        {result.items.map((item) => {
          const Icon = item.tone === "error" ? X : item.tone === "warning" ? Info : item.tone === "success" ? CheckCircle2 : Sparkles;
          return (
            <div className={`card-check__item card-check__item--${item.tone}`} key={`${item.tone}-${item.title}`}>
              <Icon size={15} aria-hidden="true" />
              <div><strong>{item.title}</strong><span>{item.detail}</span></div>
            </div>
          );
        })}
      </div>

      {result.suggestion && (
        <div className="card-check__suggestion">
          <div><Sparkles size={16} aria-hidden="true" /><span><strong>{result.suggestion.sourceLabel}</strong><small>{result.suggestion.note}</small></span></div>
          <button type="button" className="button button--ghost" onClick={onApplySuggestion}><CheckCheck size={14} aria-hidden="true" /> Apply hint</button>
        </div>
      )}

      <div className="card-check__ai">
        <div className="card-check__ai-heading">
          <div><Sparkles size={16} aria-hidden="true" /><span><strong>Optional AI review</strong><small>Check tricky articles, plurals, meanings, and duplicate clues.</small></span></div>
          <button type="button" className="button button--ghost" onClick={onAiCheck} disabled={aiChecking}>{aiChecking ? <RefreshCw size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{aiChecking ? "Checking..." : "Ask AI"}</button>
        </div>
        <small className="card-check__ai-note">The local checker stays the source of truth. AI suggestions are never saved automatically.</small>
        {aiError && <div className="card-check__ai-error" role="alert"><Info size={14} aria-hidden="true" /><span>{aiError}</span></div>}
        {aiReview && (
          <div className={`card-check__ai-result card-check__ai-result--${aiReview.verdict}`}>
            <div className="card-check__ai-result-heading"><span className={`ai-verdict ai-verdict--${aiReview.verdict}`}>{aiReview.verdict === "looks-good" ? "Looks good" : "Needs a closer look"}</span><span>Article: {aiReview.articleConfidence} · plural: {aiReview.pluralConfidence}</span></div>
            <div className="card-check__ai-fields">
              <div><span>Article</span><ArticleBadge article={aiReview.article} compact /></div>
              <div><span>Plural</span><strong>{aiReview.plural || "n/a"}</strong></div>
              <div><span>Meaning</span><strong>{aiReview.translation}</strong></div>
            </div>
            <p>{aiReview.explanation}</p>
            {aiReview.example && <div className="card-check__ai-example"><strong>Example</strong><span>{aiReview.example}</span></div>}
            {aiReview.duplicateHint && <div className="card-check__ai-duplicate"><strong>Duplicate clue</strong><span>{aiReview.duplicateHint}</span></div>}
            <div className="card-check__ai-footer"><small>Review the suggestions against a reference before using them.</small><button type="button" className="button button--ghost" onClick={onApplyAiReview}>Use suggestions</button></div>
          </div>
        )}
      </div>

      <div className="card-check__references">
        <span>Check references</span>
        <div>
          <a href="https://der-artikel.de/" target="_blank" rel="noreferrer">Articles <ExternalLink size={12} aria-hidden="true" /></a>
          <a href={`https://www.verbformen.com/?w=${encodeURIComponent(result.draft.german)}`} target="_blank" rel="noreferrer">Word forms <ExternalLink size={12} aria-hidden="true" /></a>
          <a href="https://github.com/Tsimpliarakis/German-Cheat-Sheet" target="_blank" rel="noreferrer">Grammar notes <ExternalLink size={12} aria-hidden="true" /></a>
        </div>
      </div>

      <label className="reference-check">
        <input type="checkbox" checked={referenceChecked} onChange={(event) => onReferenceChecked(event.target.checked)} />
        <span>I checked the article, meaning, and plural in a reference.</span>
      </label>
    </section>
  );
}

interface ProfileOnboardingModalProps {
  configured: boolean;
  user: FirebaseUserSummary | null;
  busy: boolean;
  firebaseError: string | null;
  onGoogleSignIn: () => void;
  onComplete: (name: string, mode: ProfileMode) => void;
}

function ProfileOnboardingModal({ configured, user, busy, firebaseError, onGoogleSignIn, onComplete }: ProfileOnboardingModalProps) {
  const [step, setStep] = useState<ProfileOnboardingStep>(() => user ? "google-confirm" : "choice");
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const panelRef = useModalFocus<HTMLElement>();

  useEffect(() => {
    if (!user) return;
    setStep("google-confirm");
    setDraftName(getGoogleFirstName(user));
    setError("");
  }, [user?.uid, user?.displayName]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [step, user?.uid]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeProfileName(draftName);
    if (!isValidProfileName(normalized)) {
      setError("Use Latin letters only, for example Anna or Jean-Luc.");
      return;
    }
    onComplete(normalized, step === "google-confirm" ? "google" : "guest");
  };

  const handleGoogleAction = () => {
    if (user) {
      setStep("google-confirm");
      setDraftName(getGoogleFirstName(user));
      setError("");
      return;
    }
    onGoogleSignIn();
  };

  const renderStepIndicator = (currentStep: number) => (
    <div className="onboarding-modal__step-indicator" aria-label={`Step ${currentStep} of 2`}>
      <span className={currentStep === 1 ? "is-active" : "is-complete"}>1</span>
      <i aria-hidden="true" />
      <span className={currentStep === 2 ? "is-active" : ""}>2</span>
      <small>of 2</small>
    </div>
  );

  return (
    <div className={`modal-backdrop modal-backdrop--onboarding ${step === "choice" ? "" : "modal-backdrop--onboarding-form"}`} role="presentation">
      <section ref={panelRef} className="modal-panel onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-intro">
        <div className="onboarding-modal__brand"><div className="onboarding-modal__icon" aria-hidden="true"><Sparkles size={21} /></div><span className="section-eyebrow">WELCOME TO DEUTSCHLY</span></div>
        {step === "choice" && (
          <>
            <h2 id="onboarding-title">How do you want to start?</h2>
            <p id="onboarding-intro" className="onboarding-modal__intro">Choose how you want to save your cards.</p>
            <div className="onboarding-modal__choices">
              {configured && <button type="button" className="button button--outline onboarding-modal__choice" onClick={handleGoogleAction} disabled={busy}><GoogleLogo size={18} /><span>{busy ? "Opening Google..." : user ? "Review Google name" : "Continue with Google"}</span><ArrowRight size={16} aria-hidden="true" /></button>}
              <button type="button" className="button button--primary onboarding-modal__choice" onClick={() => { setStep("guest"); setError(""); }} disabled={busy}><span>Continue as guest</span><ArrowRight size={16} aria-hidden="true" /></button>
            </div>
            {!configured && <div className="onboarding-modal__notice" role="status"><Info size={15} aria-hidden="true" /><span>Google sign-in is not available in this build yet. You can start as a guest and connect an account later from Settings.</span></div>}
            {firebaseError && <div className="onboarding-modal__error" role="alert"><Info size={15} aria-hidden="true" /> {firebaseError}</div>}
          </>
        )}

        {step === "guest" && (
          <>
            {renderStepIndicator(1)}
            <button type="button" className="text-button onboarding-modal__back" onClick={() => { setStep("choice"); setError(""); }}>Back to account choice</button>
            <h2 id="onboarding-title">Start as a guest.</h2>
            <p id="onboarding-intro" className="onboarding-modal__intro">Tell us what to call you and begin learning right away.</p>
            <div className="onboarding-modal__notice onboarding-modal__notice--local"><Info size={15} aria-hidden="true" /><span><strong>Guest mode stays on this device.</strong> Your cards are stored locally, so browser data can be cleared or lost. Automatic cloud sync and backup are not available until you connect Google from Settings.</span></div>
            <form onSubmit={handleSubmit} noValidate>
              <label className="form-field" htmlFor="onboarding-name"><span>Your first name</span><input id="onboarding-name" value={draftName} onChange={(event) => { setDraftName(event.target.value.slice(0, PROFILE_NAME_MAX_LENGTH)); setError(""); }} placeholder="e.g. Anna" maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="given-name" spellCheck={false} inputMode="text" aria-invalid={Boolean(error)} aria-describedby={error ? "onboarding-name-error" : "onboarding-name-help"} /></label>
              <small id="onboarding-name-help" className="onboarding-modal__helper">Use Latin letters, for example Anna or Jean-Luc. You can edit this later.</small>
              {error && <div id="onboarding-name-error" className="onboarding-modal__error" role="alert"><Info size={15} aria-hidden="true" /> {error}</div>}
              <button type="submit" className="button button--primary onboarding-modal__submit"><span>Start as guest</span><ArrowRight size={16} aria-hidden="true" /></button>
            </form>
          </>
        )}

        {step === "google-confirm" && user && (
          <>
            {renderStepIndicator(2)}
            <button type="button" className="text-button onboarding-modal__back" onClick={() => { setStep("choice"); setError(""); }}>Back to account choice</button>
            <h2 id="onboarding-title">Is this your name?</h2>
            <p id="onboarding-intro" className="onboarding-modal__intro">Google found your account successfully. We suggested your first name below, and you can change it before continuing.</p>
            <div className="onboarding-modal__account"><GoogleLogo size={17} /><span><strong>{user.email || "Google account connected"}</strong><small>Signed in with Google</small></span></div>
            <form onSubmit={handleSubmit} noValidate>
              <label className="form-field" htmlFor="onboarding-google-name"><span>Name in Deutschly</span><input id="onboarding-google-name" value={draftName} onChange={(event) => { setDraftName(event.target.value.slice(0, PROFILE_NAME_MAX_LENGTH)); setError(""); }} placeholder="e.g. Anna" maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="given-name" spellCheck={false} inputMode="text" aria-invalid={Boolean(error)} aria-describedby={error ? "onboarding-google-name-error" : "onboarding-google-name-help"} /></label>
              <small id="onboarding-google-name-help" className="onboarding-modal__helper">Only the first name is used from Google. Latin letters are required, and you can change it any time in Settings.</small>
              {error && <div id="onboarding-google-name-error" className="onboarding-modal__error" role="alert"><Info size={15} aria-hidden="true" /> {error}</div>}
              <button type="submit" className="button button--primary onboarding-modal__submit"><span>Yes, continue</span><ArrowRight size={16} aria-hidden="true" /></button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function FirebaseAccountSection({
  configured,
  user,
  busy,
  error,
  onSignIn,
  onSignOut,
  onSync,
  onDeleteAccount,
}: {
  configured: boolean;
  user: FirebaseUserSummary | null;
  busy: boolean;
  error: string | null;
  onSignIn: (provider: FirebaseAuthProvider) => void;
  onSignOut: () => void;
  onSync: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <section className="settings-section" aria-labelledby="settings-account-title">
      <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--primary" aria-hidden="true"><Cloud size={16} /></span><div><h3 id="settings-account-title">Cloud account</h3><p>Use one account to keep your cards in sync on your phone and computer.</p></div></div>
      {!configured && <div className="settings-notification settings-notification--default" role="status"><span className="settings-notification__copy"><Cloud size={14} aria-hidden="true" /><span><strong>Firebase setup is still needed</strong><small>Add the Firebase web settings to this build, then enable Google sign-in.</small></span></span></div>}
      {configured && !user && <div className="firebase-account__actions"><button type="button" className="button button--outline firebase-account__connect" onClick={() => onSignIn("google")} disabled={busy} aria-label="Continue with Google" title="Continue with Google"><GoogleLogo size={17} /><span>Continue with Google</span></button></div>}
      {configured && user && <div className="firebase-account__signed-in"><div className="firebase-account__identity"><strong>{user.displayName || user.email || "Signed in"}</strong><small>{user.email || "Account connected"}</small></div><div className="firebase-account__actions"><button type="button" className="button button--outline" onClick={onSync} disabled={busy}><Cloud size={15} aria-hidden="true" /> {busy ? "Syncing..." : "Sync now"}</button><button type="button" className="button button--ghost" onClick={onSignOut} disabled={busy}>Sign out</button><button type="button" className="button button--ghost settings-danger-action" onClick={onDeleteAccount} disabled={busy}>Delete cloud account</button></div></div>}
      {error && <div className="onboarding-modal__error firebase-account__error" role="alert"><Info size={15} aria-hidden="true" /> {error}</div>}
    </section>
  );
}

interface ProfileModalProps {
  name: string;
  theme: Theme;
  dailyGoal: number;
  reminderEnabled: boolean;
  reminderTime: string;
  notificationPermission: NotificationPermissionState;
  reminderSnoozedUntil: number | null;
  currentTime: Date;
  cardCount: number;
  syncConfigured: boolean;
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isMobile: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  onThemeChange: (theme: Theme) => void;
  onDailyGoalChange: (value: number) => void;
  onReminderToggle: () => void;
  onReminderTimeChange: (value: string) => void;
  onEnableNotifications: () => void;
  onSnoozeReminder: () => void;
  onAddReminderToCalendar: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenSync: () => void;
  onResetProgress: () => void;
  onInstallApp: () => void;
  firebaseConfigured: boolean;
  firebaseUser: FirebaseUserSummary | null;
  firebaseBusy: boolean;
  firebaseError: string | null;
  onFirebaseSignIn: (provider: FirebaseAuthProvider) => void;
  onFirebaseSignOut: () => void;
  onFirebaseSync: () => void;
  onFirebaseDeleteAccount: () => void;
}

function ProfileModal({
  name,
  theme,
  dailyGoal,
  reminderEnabled,
  reminderTime,
  notificationPermission,
  reminderSnoozedUntil,
  currentTime,
  cardCount,
  syncConfigured,
  canInstall,
  isInstalled,
  isIos,
  isMobile,
  onClose,
  onSave,
  onThemeChange,
  onDailyGoalChange,
  onReminderToggle,
  onReminderTimeChange,
  onEnableNotifications,
  onSnoozeReminder,
  onAddReminderToCalendar,
  onExportBackup,
  onImportBackup,
  onOpenSync,
  onResetProgress,
  onInstallApp,
  firebaseConfigured,
  firebaseUser,
  firebaseBusy,
  firebaseError,
  onFirebaseSignIn,
  onFirebaseSignOut,
  onFirebaseSync,
  onFirebaseDeleteAccount,
}: ProfileModalProps) {
  const [draftName, setDraftName] = useState(name);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useModalFocus<HTMLElement>(onClose);
  const notificationCopy = notificationPermission === "granted"
    ? "Browser alerts are on for review reminders."
    : notificationPermission === "default"
      ? "Allow alerts when cards are ready for review."
      : notificationPermission === "denied"
        ? "Notifications are blocked. Calendar still works when closed."
        : "This browser supports the in-app reminder only.";
  const installCopy = isInstalled
    ? "Installed on this device."
    : canInstall
      ? "Install it for quick access from your home screen."
      : isIos
        ? "In Safari, use Share, then Add to Home Screen."
        : isMobile
          ? "Open the browser menu and choose Install app."
          : "Use the install icon or browser menu when it becomes available.";

  return (
    <div className="modal-backdrop modal-backdrop--settings" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel profile-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">YOUR LEARNING SPACE</span><h2 id="settings-title">Settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Keep your profile, study rhythm, appearance, and local data in one calm place.</p>

        <div className="settings-sections">
          <section className="settings-section" aria-labelledby="settings-profile-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--primary" aria-hidden="true"><Settings size={16} /></span><div><h3 id="settings-profile-title">Profile</h3><p>Personal details used across your learning space.</p></div></div>
            <div className="profile-preview"><ProfileAvatar className="profile-preview__avatar" name={draftName} dayKey={getDayKey()} photoURL={firebaseUser?.photoURL} size={58} /><div><span className="section-eyebrow">LEARNER</span><strong>{draftName.trim() || "Your name"}</strong><small>Private on this device</small></div></div>
            <label className="form-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" value={draftName} onChange={(event) => setDraftName(event.target.value.slice(0, PROFILE_NAME_MAX_LENGTH))} placeholder="e.g. Anna" maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="name" spellCheck={false} /></label>
          </section>

          <FirebaseAccountSection configured={firebaseConfigured} user={firebaseUser} busy={firebaseBusy} error={firebaseError} onSignIn={onFirebaseSignIn} onSignOut={onFirebaseSignOut} onSync={onFirebaseSync} onDeleteAccount={onFirebaseDeleteAccount} />

          <section className="settings-section" aria-labelledby="settings-appearance-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--indigo" aria-hidden="true">{theme === "light" ? <Sun size={16} /> : <Moon size={16} />}</span><div><h3 id="settings-appearance-title">Appearance</h3><p>Choose the surface that feels easiest to study in.</p></div></div>
            <div className="settings-row settings-row--stack-mobile">
              <div className="settings-row__copy"><strong>Theme</strong><small>Apply instantly across the app.</small></div>
              <div className="settings-choice-group" role="group" aria-label="Theme">
                <button type="button" className={`settings-choice${theme === "light" ? " settings-choice--active" : ""}`} onClick={() => onThemeChange("light")} aria-pressed={theme === "light"}><Sun size={14} aria-hidden="true" /> Light</button>
                <button type="button" className={`settings-choice${theme === "dark" ? " settings-choice--active" : ""}`} onClick={() => onThemeChange("dark")} aria-pressed={theme === "dark"}><Moon size={14} aria-hidden="true" /> Dark</button>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="settings-plan-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--mint" aria-hidden="true"><Target size={16} /></span><div><h3 id="settings-plan-title">Study plan</h3><p>Set a gentle daily target that shapes your progress ring and goal.</p></div></div>
            <div className="settings-row settings-row--stack-mobile">
              <div className="settings-row__copy"><strong>Cards per day</strong><small>Choose between 1 and 100 reviews.</small></div>
              <label className="settings-number-field" htmlFor="settings-daily-goal"><span className="sr-only">Cards per day</span><input id="settings-daily-goal" type="number" min="1" max="100" step="1" value={dailyGoal} onChange={(event) => onDailyGoalChange(Number(event.target.value))} /></label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="settings-reminder-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--orange" aria-hidden="true"><Bell size={16} /></span><div><h3 id="settings-reminder-title">Study reminders</h3><p>Choose when Deutschly should bring your review back to mind.</p></div></div>
            <div className="settings-row">
              <div className="settings-row__copy"><strong>Smart reminder</strong><small>{reminderEnabled ? "Your daily review window is active." : "Reminders are currently paused."}</small></div>
              <button type="button" className={`switch${reminderEnabled ? " switch--on" : ""}`} onClick={onReminderToggle} aria-pressed={reminderEnabled} aria-label="Toggle daily reminder"><span /></button>
            </div>
            <div className="settings-reminder-grid">
              <label className="form-field settings-time-field" htmlFor="settings-reminder-time"><span>Daily review time</span><input id="settings-reminder-time" type="time" value={reminderTime} onChange={(event) => onReminderTimeChange(event.target.value)} disabled={!reminderEnabled} /></label>
              <button type="button" className="button button--outline" onClick={onAddReminderToCalendar}><CalendarPlus size={15} aria-hidden="true" /> Add to calendar</button>
            </div>
            <div className={`settings-notification settings-notification--${notificationPermission}`} role="status" aria-live="polite"><span className="settings-notification__copy"><Bell size={14} aria-hidden="true" /><span><strong>Browser notifications</strong><small>{notificationCopy}</small></span></span>{notificationPermission === "default" && <button type="button" className="text-button" onClick={onEnableNotifications}>Enable</button>}</div>
            {reminderSnoozedUntil && <div className="settings-snooze"><span><Clock3 size={14} aria-hidden="true" /> Snoozed until {formatReminderTarget(new Date(reminderSnoozedUntil), currentTime)}.</span><button type="button" className="text-button" onClick={onSnoozeReminder}>Cancel snooze</button></div>}
          </section>

          <section className="settings-section" aria-labelledby="settings-data-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--mint" aria-hidden="true"><Cloud size={16} /></span><div><h3 id="settings-data-title">Data and sync</h3><p>Your cards stay local unless you choose to export or sync them.</p></div></div>
            <div className="settings-data-summary"><strong>{cardCount} cards</strong><span>{syncConfigured ? "Sync setup saved" : "Sync not configured yet"}</span></div>
            <input ref={backupInputRef} type="file" accept=".json,application/json" className="visually-hidden" onChange={onImportBackup} aria-hidden="true" tabIndex={-1} />
            <div className="settings-action-grid"><button type="button" className="button button--outline" onClick={onExportBackup}><Download size={15} aria-hidden="true" /> Export backup</button><button type="button" className="button button--outline" onClick={() => backupInputRef.current?.click()}><Upload size={15} aria-hidden="true" /> Import backup</button><button type="button" className="button button--outline" onClick={onOpenSync}><Cloud size={15} aria-hidden="true" /> Sync devices</button><button type="button" className="button button--ghost settings-danger-action" onClick={onResetProgress}><RefreshCw size={15} aria-hidden="true" /> Reset progress</button></div>
          </section>

          <section className="settings-section" aria-labelledby="settings-app-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--primary" aria-hidden="true"><Download size={16} /></span><div><h3 id="settings-app-title">App</h3><p>Make Deutschly easy to return to on your phone or computer.</p></div></div>
            <div className="settings-row settings-app-row"><div className="settings-row__copy"><strong>Install Deutschly</strong><small>{installCopy}</small></div>{!isInstalled && canInstall && <button type="button" className="button button--outline" onClick={onInstallApp}>Install app</button>}{isInstalled && <span className="settings-status settings-status--success"><CheckCircle2 size={14} aria-hidden="true" /> Installed</span>}</div>
          </section>
        </div>

        <div className="modal-panel__footer"><span><Settings size={15} aria-hidden="true" /> Name changes are saved with your profile.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={() => onSave(draftName)}>Save profile</button></div></div>
      </section>
    </div>
  );
}

function SyncModal({
  endpoint,
  room,
  error,
  autoSync,
  syncStatus,
  isOnline,
  testingConnection,
  conflict,
  onEndpointChange,
  onRoomChange,
  onAutoSyncChange,
  onTestConnection,
  onCopyRoom,
  onResolveConflict,
  onClose,
  onSave,
}: {
  endpoint: string;
  room: string;
  error: string | null;
  autoSync: boolean;
  syncStatus: SyncStatus;
  isOnline: boolean;
  testingConnection: boolean;
  conflict: SyncConflict | null;
  onEndpointChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onAutoSyncChange: (value: boolean) => void;
  onTestConnection: () => void;
  onCopyRoom: () => void;
  onResolveConflict: (resolution: SyncResolution) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const panelRef = useModalFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <div className="modal-panel__heading">
          <div><span className="section-eyebrow">PRIVATE DEVICE SYNC</span><h2 id="sync-title">Connect your devices</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close sync settings" title="Close"><X size={19} aria-hidden="true" /></button>
        </div>
        <p className="modal-panel__intro">Run the Deutschly bridge on your PC, then use the same room code on your phone. Your cards stay in this private room instead of going to a third-party service. The bridge can use Gemini or a free local Ollama model without putting an AI key in your browser.</p>
        <div className="sync-modal__steps" aria-label="Sync setup steps">
          <div><strong>1</strong><span>Open a terminal in the folder that contains <code>package.json</code>. For this project: <code>C:\Users\Soheil\Documents\ChatGPT\Gamify</code>.</span></div>
          <div><strong>2</strong><span>On the PC, run <code>npm run sync-server -- --host 0.0.0.0</code>. For free local AI, add <code>--ai-provider ollama</code>.</span></div>
          <div><strong>3</strong><span>Open the app on both devices over the same Wi-Fi network.</span></div>
          <div><strong>4</strong><span>Save the same room on both devices. Auto-sync can keep them up to date.</span></div>
        </div>
        <div className="form-grid">
          <label className="form-field" htmlFor="sync-endpoint"><span>Sync server URL</span><input id="sync-endpoint" value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} placeholder="/api/sync or http://192.168.1.20:8787/api/sync" /></label>
          <label className="form-field" htmlFor="sync-room"><span>Room code</span><input id="sync-room" value={room} onChange={(event) => onRoomChange(normalizeSyncRoom(event.target.value))} placeholder="8 characters" maxLength={32} autoCapitalize="characters" spellCheck={false} /></label>
        </div>
        <label className="sync-auto-option"><input type="checkbox" checked={autoSync} onChange={(event) => onAutoSyncChange(event.target.checked)} /><span><strong>Keep sync on automatically</strong><small>Push local changes after a short pause and look for updates from the other device every minute.</small></span></label>
        <div className={`sync-status sync-status--${isOnline ? syncStatus : "offline"}`} role="status"><Wifi size={15} aria-hidden="true" /><span>{!isOnline ? "Offline. Local changes are safe." : syncStatus === "syncing" ? "Syncing now..." : syncStatus === "synced" ? "Connection is ready." : syncStatus === "offline" ? "Not connected yet." : syncStatus === "conflict" ? "Changes need your choice." : syncStatus === "error" ? "Connection needs attention." : "Connection not tested yet."}</span><button type="button" className="text-button" onClick={onTestConnection} disabled={testingConnection || !endpoint.trim() || !isOnline || Boolean(conflict)}>{testingConnection ? "Testing..." : "Test connection"}</button></div>
        {conflict && <div className="sync-modal__conflict" role="alert"><div className="sync-modal__conflict-copy"><strong>Changes found on both devices</strong><span>This device has {conflict.localCardCount} cards and the shared room has {conflict.remoteCardCount} cards. Choose a safe resolution before syncing again.</span>{conflict.remoteUpdatedAt && <small>Other device: {formatSyncLabel(conflict.remoteUpdatedAt)}</small>}</div><div className="sync-modal__conflict-actions"><button type="button" className="button button--primary" onClick={() => onResolveConflict("merge")} disabled={!isOnline || testingConnection}>Merge both</button><button type="button" className="button button--outline" onClick={() => onResolveConflict("local")} disabled={!isOnline || testingConnection}>Keep this device</button><button type="button" className="button button--outline" onClick={() => onResolveConflict("remote")} disabled={!isOnline || testingConnection}>Use other device</button></div></div>}
        <div className="sync-modal__warning"><Info size={15} aria-hidden="true" /><span>Anyone with this room code can read and write its data. Use it only on a trusted network; this starter server is not for public internet use without HTTPS and authentication.</span></div>
        {error && <div className="sync-modal__error" role="alert"><X size={15} aria-hidden="true" /><span>{error}</span></div>}
        <div className="modal-panel__footer">
          <span><Cloud size={15} aria-hidden="true" /> {room ? `Room ${room}` : "Choose a room code"}</span>
          <div><button type="button" className="button button--ghost" onClick={onCopyRoom} disabled={room.length < 6}><Copy size={15} aria-hidden="true" /> Copy room</button><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={onSave} disabled={room.length < 6 || !endpoint.trim()}><Cloud size={16} aria-hidden="true" /> Save connection</button></div>
        </div>
      </section>
    </div>
  );
}

function AddCardModal({ onClose, onSave, onDelete, existingCards, initialDraft, editing = false, geminiEndpoint }: { onClose: () => void; onSave: (draft: CardDraft) => void; onDelete?: () => void; existingCards: Flashcard[]; initialDraft?: Partial<CardDraft>; editing?: boolean; geminiEndpoint: string }) {
  const [draft, setDraft] = useState<CardDraft>(() => createCardDraft(initialDraft));
  const [checkResult, setCheckResult] = useState<CardCheckResult | null>(null);
  const [referenceChecked, setReferenceChecked] = useState(false);
  const [aiReview, setAiReview] = useState<GeminiCardReview | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const germanInputRef = useRef<HTMLInputElement>(null);
  const hasPrefilledContent = Boolean(initialDraft?.german?.trim() || initialDraft?.translation?.trim());
  const panelRef = useModalFocus<HTMLElement>(onClose, hasPrefilledContent ? undefined : () => germanInputRef.current, !hasPrefilledContent);
  const wordSuggestions = useMemo(() => {
    if (editing || draft.kind !== "word" || normalizeGermanTerm(draft.german).length < 2) return [];
    return searchGermanWords(draft.german, 5);
  }, [draft.german, draft.kind, editing]);
  const liveMatch = useMemo(() => {
    if (!draft.german.trim()) return null;
    return findCardMatch(existingCards, prepareCardDraft(draft));
  }, [draft, existingCards]);

  const update = <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setCheckResult(null);
    setReferenceChecked(false);
    setAiReview(null);
    setAiError(null);
  };

  const applyWordSuggestion = (word: GermanWordRecord) => {
    setDraft((current) => ({
      ...current,
      ...germanWordToCardDraft(word),
      tags: normalizeTags([...normalizeTags(current.tags.split(",")), ...word.tags]).join(", "),
    }));
    setCheckResult(null);
    setReferenceChecked(false);
    setAiReview(null);
    setAiError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.german.trim() || !draft.translation.trim()) return;
    const result = getCardCheck(existingCards, draft);
    setDraft(result.draft);
    setCheckResult(result);
    setReferenceChecked(false);
    setAiReview(null);
    setAiError(null);
  };

  const handleAiCheck = async () => {
    if (!checkResult || aiChecking) return;
    setAiChecking(true);
    setAiError(null);
    const checkedDraft = checkResult.draft;
    const germanTerm = normalizeGermanTerm(checkedDraft.german);
    const input: GeminiCardReviewInput = {
      german: checkedDraft.german,
      translation: checkedDraft.translation,
      article: checkedDraft.article,
      plural: checkedDraft.plural,
      example: checkedDraft.example,
      note: checkedDraft.note,
      kind: checkedDraft.kind,
      existingMatches: existingCards
        .filter((card) => normalizeGermanTerm(card.german) === germanTerm)
        .slice(0, 20)
        .map((card) => ({ german: card.german, article: card.article, translation: card.translation })),
    };

    try {
      setAiReview(await reviewCardWithGemini(geminiEndpoint, input));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "The AI could not review this card.");
    } finally {
      setAiChecking(false);
    }
  };

  const applyAiReview = () => {
    if (!aiReview) return;
    setDraft((current) => ({
      ...current,
      article: aiReview.article,
      plural: aiReview.plural,
      translation: aiReview.translation,
      example: aiReview.example,
    }));
    setCheckResult(null);
    setReferenceChecked(false);
    setAiReview(null);
    setAiError(null);
  };

  const handleConfirm = () => {
    if (!checkResult || checkResult.match?.type === "exact" || !referenceChecked) return;
    onSave({ ...checkResult.draft, referenceChecked: true });
  };

  const applySuggestion = () => {
    const suggestion = checkResult?.suggestion;
    if (!suggestion) return;
    setDraft((current) => ({
      ...current,
      ...(suggestion.article ? { article: suggestion.article } : {}),
      ...(suggestion.plural !== undefined ? { plural: suggestion.plural } : {}),
      ...(suggestion.translation ? { translation: suggestion.translation } : {}),
      ...(suggestion.example ? { example: suggestion.example } : {}),
    }));
    setCheckResult(null);
    setReferenceChecked(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className="modal-panel flashcard-modal" tabIndex={hasPrefilledContent ? -1 : undefined} role="dialog" aria-modal="true" aria-labelledby="add-card-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">PERSONAL LIBRARY</span><h2 id="add-card-title">{editing ? "Edit a flashcard" : "Add a flashcard"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close add card dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Add a word, phrase, or grammar item. Deutschly checks your entry for duplicates and common issues before it joins the review queue.</p>
        {liveMatch && <div className={`card-live-match card-live-match--${liveMatch.type}`} role="status"><Info size={15} aria-hidden="true" /><span><strong>{liveMatch.type === "exact" ? "This card is already saved." : "A card with this headword already exists."}</strong><small>{liveMatch.card.german} · {liveMatch.card.translation}. Press Check card to compare the meaning.</small></span></div>}
        <form onSubmit={handleSubmit}>
          <section className="flashcard-form__section" aria-labelledby="flashcard-core-heading">
            <div className="flashcard-form__section-heading"><span>1</span><div><strong id="flashcard-core-heading">Word and meaning</strong><small>Start with the pair you want to remember.</small></div></div>
            <div className="form-grid form-grid--two">
              <div className="form-field-with-suggestions">
                <label className="form-field" htmlFor="card-german"><span>German *</span><input id="card-german" ref={germanInputRef} value={draft.german} onChange={(event) => update("german", event.target.value)} placeholder="e.g. gemütlich or Das Eis" required aria-autocomplete="list" aria-controls={wordSuggestions.length > 0 ? "card-word-suggestions" : undefined} aria-expanded={wordSuggestions.length > 0} /></label>
                {wordSuggestions.length > 0 && <div id="card-word-suggestions" className="word-suggestion-list" role="listbox" aria-label="German word bank suggestions">
                  {wordSuggestions.map((word) => <button type="button" className="word-suggestion" role="option" aria-label={`Use ${word.german}`} key={word.id} onClick={() => applyWordSuggestion(word)}><ArticleBadge article={word.article} partOfSpeech={word.partOfSpeech} compact /><span className="word-suggestion__copy"><strong>{word.german}</strong><small>{word.englishMeanings.join(" / ")}</small>{word.plural && <small>Plural: {word.plural}</small>}{word.source && <small className="word-suggestion__source">{word.source.lesson} · p. {word.source.page}</small>}</span><span className="word-suggestion__meta"><span>{word.level}</span><Check size={14} aria-hidden="true" /></span></button>)}
                </div>}
              </div>
              <label className="form-field" htmlFor="card-translation"><span>Translation *</span><input id="card-translation" value={draft.translation} onChange={(event) => update("translation", event.target.value)} placeholder="e.g. cozy or ice cream" required /></label>
            </div>
          </section>
          <section className="flashcard-form__section" aria-labelledby="flashcard-detail-heading">
            <div className="flashcard-form__section-heading"><span>2</span><div><strong id="flashcard-detail-heading">Make it memorable</strong><small>Add the grammar signal and context that help recall.</small></div></div>
            <div className="form-grid form-grid--three">
              <label className="form-field" htmlFor="card-article"><span>Article</span><select id="card-article" value={draft.article} onChange={(event) => update("article", event.target.value as Article)}><option value="der">der · masculine</option><option value="die">die · feminine</option><option value="das">das · neuter</option><option value="plural">die · plural</option><option value="none">No article</option></select></label>
              <label className="form-field" htmlFor="card-plural"><span>Plural</span><input id="card-plural" value={draft.plural} onChange={(event) => update("plural", event.target.value)} placeholder="e.g. Bücher" /></label>
              <label className="form-field" htmlFor="card-kind"><span>Item type</span><select id="card-kind" value={draft.kind} onChange={(event) => update("kind", event.target.value as CardKind)}><option value="word">Vocabulary</option><option value="phrase">Phrase</option><option value="grammar">Grammar</option></select></label>
            </div>
            <div className="form-grid form-grid--two">
              <label className="form-field" htmlFor="card-example"><span>Example sentence</span><textarea id="card-example" value={draft.example} onChange={(event) => update("example", event.target.value)} placeholder="Write a sentence you can imagine using..." rows={2} /></label>
              <label className="form-field" htmlFor="card-note"><span>Personal note</span><textarea id="card-note" value={draft.note} onChange={(event) => update("note", event.target.value)} placeholder="A memory hint, related word, or pronunciation note" rows={2} /></label>
            </div>
          </section>
          <section className="flashcard-form__section" aria-labelledby="flashcard-organize-heading">
            <div className="flashcard-form__section-heading"><span>3</span><div><strong id="flashcard-organize-heading">Organize your card</strong><small>Keep it easy to find in your personal library.</small></div></div>
            <div className="form-grid form-grid--three">
              <label className="form-field" htmlFor="card-tags"><span>Tags</span><input id="card-tags" value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. lesson-1, difficult, travel" /></label>
              <label className="form-field" htmlFor="card-lesson"><span>Lesson or collection</span><input id="card-lesson" value={draft.lesson} onChange={(event) => update("lesson", event.target.value)} placeholder="e.g. Lesson 1" /></label>
              <label className="form-field" htmlFor="card-source-page"><span>PDF page <small>(optional)</small></span><input id="card-source-page" type="number" min="1" value={draft.sourcePage ?? ""} onChange={(event) => update("sourcePage", event.target.value ? Number(event.target.value) : undefined)} placeholder="e.g. 14" /></label>
            </div>
          </section>
          {checkResult && <CardCheckPanel result={checkResult} referenceChecked={referenceChecked} onReferenceChecked={setReferenceChecked} onApplySuggestion={applySuggestion} aiReview={aiReview} aiError={aiError} aiChecking={aiChecking} onAiCheck={() => void handleAiCheck()} onApplyAiReview={applyAiReview} />}
          <div className="modal-panel__footer">
            <span><Info size={15} aria-hidden="true" /> {checkResult ? "Confirm the details after checking the references." : "A quick check helps keep your library clean."}</span>
            <div>
              {editing && !checkResult && onDelete && <button type="button" className="button button--icon button--ghost delete-card-button" onClick={onDelete} aria-label="Delete card" title="Delete card"><Trash2 size={16} aria-hidden="true" /></button>}
              {checkResult && <button type="button" className="button button--icon button--ghost" onClick={() => setCheckResult(null)} aria-label="Edit card" title="Edit card"><Pencil size={16} aria-hidden="true" /></button>}
              <button type="button" className="button button--icon button--ghost" onClick={onClose} aria-label="Cancel" title="Cancel"><X size={17} aria-hidden="true" /></button>
              {!checkResult && <button type="submit" className="button button--icon button--primary" aria-label="Check card" title="Check card"><CheckCircle2 size={17} aria-hidden="true" /></button>}
              {checkResult && <button type="button" className="button button--icon button--primary" onClick={handleConfirm} disabled={checkResult.match?.type === "exact" || !referenceChecked} aria-label={checkResult.match?.type === "exact" ? "Already added" : !referenceChecked ? "Check references first" : checkResult.match?.type === "possible" ? "Add as separate meaning" : "Add checked card"} title={checkResult.match?.type === "exact" ? "Already added" : !referenceChecked ? "Check references first" : checkResult.match?.type === "possible" ? "Add as separate meaning" : "Add checked card"}><CheckCircle2 size={17} aria-hidden="true" /></button>}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const installPrompt = useInstallPrompt();
  const firebaseConfigured = isFirebaseConfigured();
  const [installDismissed, setInstallDismissed] = useState(() => loadLocalBooleanSetting(PWA_INSTALL_DISMISSED_KEY));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());
  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab());
  const [studySession, setStudySession] = useState({ reviewed: 0, total: 0 });
  const [studyQueueIds, setStudyQueueIds] = useState<string[] | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncEndpoint, setSyncEndpoint] = useState(() => loadLocalSetting(SYNC_ENDPOINT_KEY));
  const [syncRoom, setSyncRoom] = useState(() => loadLocalSetting(SYNC_ROOM_KEY) || createSyncRoom());
  const [autoSync, setAutoSync] = useState(() => loadLocalBooleanSetting(AUTO_SYNC_KEY));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [testingConnection, setTestingConnection] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserSummary | null>(null);
  const [firebaseBusy, setFirebaseBusy] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [firebaseMergePrompt, setFirebaseMergePrompt] = useState<FirebaseMergePrompt | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [pdfCandidates, setPdfCandidates] = useState<PdfCandidate[]>(() => state.pdfImport?.candidates ?? []);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [addCardSeed, setAddCardSeed] = useState<Partial<CardDraft> | undefined>(undefined);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [wordBankReviewId, setWordBankReviewId] = useState<string | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [profileName, setProfileName] = useState(() => loadProfileName());
  const [profileOnboardingOpen, setProfileOnboardingOpen] = useState(() => !loadProfileName());
  const [profileOpen, setProfileOpen] = useState(false);
  const [resetProgressOpen, setResetProgressOpen] = useState(false);
  const [reminderSnoozedUntil, setReminderSnoozedUntil] = useState<number | null>(() => {
    const value = loadLocalNumberSetting(REMINDER_SNOOZE_KEY);
    return value && value > Date.now() ? value : null;
  });
  const [weakCardsOnly, setWeakCardsOnly] = useState(false);
  const [databaseWords, setDatabaseWords] = useState<GermanWordRecord[]>([]);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const stateRef = useRef(state);
  const profileNameRef = useRef(profileName);
  const syncInFlightRef = useRef(false);
  const autoSyncReadyRef = useRef(false);
  const lastAutoSyncFingerprintRef = useRef("");
  const firebaseSyncInFlightRef = useRef(false);
  const firebaseAuthSyncUserRef = useRef("");
  const firebaseChoiceRequiredRef = useRef("");
  const lastFirebaseSyncFingerprintRef = useRef("");
  const germanWordDatabasePromiseRef = useRef<Promise<GermanWordRecord[]> | null>(null);

  const todayKey = getDayKey();
  stateRef.current = state;
  profileNameRef.current = profileName;
  const cardPendingDeletion = deleteCardId ? state.cards.find((card) => card.id === deleteCardId) : undefined;
  const profileDisplayName = profileName || PROFILE_DISPLAY_FALLBACK;
  const wordBank = useMemo(() => mergeGermanWordRecords(databaseWords, state.wordBank), [databaseWords, state.wordBank]);
  const wordBankInboxItems = useMemo(() => {
    const wordsById = new Map(wordBank.map((word) => [word.id, word]));
    return state.wordBankInboxIds
      .map((id) => {
        const word = wordsById.get(id);
        return word ? { word, decision: (state.wordBankDecisions[id] ?? "pending") as WordBankDecision } : null;
      })
      .filter((item): item is WordBankInboxItem => Boolean(item))
      .reverse();
  }, [state.wordBankDecisions, state.wordBankInboxIds, wordBank]);
  const dueCards = useMemo(() => state.cards
    .filter((card) => card.due <= todayKey)
    .sort((first, second) => {
      const dueOrder = first.due.localeCompare(second.due);
      if (dueOrder !== 0) return dueOrder;
      const difficultyOrder = (second.difficulty ?? 5) - (first.difficulty ?? 5);
      if (difficultyOrder !== 0) return difficultyOrder;
      return timestamp(first.lastReviewedAt) - timestamp(second.lastReviewedAt);
    }), [state.cards, todayKey]);
  const studySessionCapacity = getPracticeSessionLength(getLevelProgress(state.xp).level, dueCards.length);
  const studyCards = useMemo(() => {
    if (studyQueueIds === null) {
      const sessionComplete = studySession.total > 0 && studySession.reviewed >= studySession.total;
      return sessionComplete ? [] : dueCards.slice(0, studySessionCapacity);
    }
    return studyQueueIds.map((id) => state.cards.find((card) => card.id === id)).filter((card): card is Flashcard => Boolean(card));
  }, [dueCards, state.cards, studyQueueIds, studySession.reviewed, studySession.total, studySessionCapacity]);
  const syncConfigured = Boolean(syncEndpoint.trim() && syncRoom.length >= 6);
  const syncFingerprint = useMemo(() => getSyncFingerprint(state), [state]);
  const showInstallPrompt = !installDismissed && !installPrompt.isInstalled && (installPrompt.canInstall || installPrompt.isIos || installPrompt.isMobile);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const ensureGermanWordDatabase = () => {
    germanWordDatabasePromiseRef.current ??= loadGermanWordDatabase().then((words) => {
      setDatabaseWords(words);
      return words;
    });
    return germanWordDatabasePromiseRef.current;
  };

  useEffect(() => {
    if (activeTab !== "library" && !addCardOpen) return;
    void ensureGermanWordDatabase();
  }, [activeTab, addCardOpen]);

  useEffect(() => {
    setPdfCandidates(state.pdfImport?.candidates ?? []);
  }, [state.pdfImport?.candidates]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
    document.title = "Deutschly · German that sticks";
  }, [state.theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    updateReviewBadge(dueCards.length);
  }, [dueCards.length]);

  useEffect(() => {
    if (studyQueueIds === null || studyQueueIds.length === 0) return;
    const existingIds = new Set(state.cards.map((card) => card.id));
    const validIds = studyQueueIds.filter((id) => existingIds.has(id));
    if (validIds.length !== studyQueueIds.length) setStudyQueueIds(validIds);
  }, [state.cards, studyQueueIds]);

  useEffect(() => {
    const refreshNotificationPermission = () => setNotificationPermission(getNotificationPermission());
    window.addEventListener("focus", refreshNotificationPermission);
    document.addEventListener("visibilitychange", refreshNotificationPermission);
    return () => {
      window.removeEventListener("focus", refreshNotificationPermission);
      document.removeEventListener("visibilitychange", refreshNotificationPermission);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToFirebaseAuth((user) => {
      if (mounted) setFirebaseUser(user);
    });
    void finishFirebaseRedirectSignIn()
      .then((user) => {
        if (mounted && user) setFirebaseUser(user);
      })
      .catch((error: unknown) => {
        if (mounted) setFirebaseError(firebaseErrorMessage(error, "auth"));
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [firebaseConfigured]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const modalOpen = addCardOpen || profileOpen || profileOnboardingOpen || syncOpen || resetProgressOpen || Boolean(deleteCardId) || Boolean(bulkDeleteIds) || deleteAccountOpen || Boolean(firebaseMergePrompt);
    document.documentElement.classList.toggle("modal-open", modalOpen);
    document.body.classList.toggle("modal-open", modalOpen);
    return () => {
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    };
  }, [addCardOpen, profileOpen, profileOnboardingOpen, syncOpen, resetProgressOpen, deleteCardId, bulkDeleteIds, deleteAccountOpen, firebaseMergePrompt]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (addCardOpen || activeTab !== "study") return;
      if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(event.target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setShowAnswer(true);
      }
      if (showAnswer && ["1", "2", "3", "4"].includes(event.key)) {
        const rating = ["again", "hard", "good", "easy"][Number(event.key) - 1] as ReviewRating;
        handleRate(rating);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, addCardOpen, showAnswer, dueCards, studyCards]);

  const showToast = (message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!state.reminderEnabled || dueCards.length === 0) return undefined;

    const message = `${dueCards.length} card${dueCards.length === 1 ? "" : "s"} ready for review.`;
    const showReminder = (tag: string) => {
      if ("Notification" in window && Notification.permission === "granted") {
        const showNotification = async () => {
          try {
            if ("serviceWorker" in navigator) {
              const registration = await navigator.serviceWorker.ready;
              const notificationOptions = {
                body: message,
                icon: "./icon-192.svg",
                badge: "./icon-192.svg",
                tag,
                actions: [{ action: "review", title: "Review now" }],
                data: { url: "./?tab=study" },
              } as NotificationOptions;
              await registration.showNotification("Deutschly review reminder", notificationOptions);
              return;
            }
          } catch {
            // Fall back to the page notification when a service worker is unavailable.
          }
          try {
            new Notification("Deutschly review reminder", { body: message, icon: "./icon-192.svg" });
          } catch {
            showToast(message);
          }
        };
        void showNotification();
      } else {
        showToast(message);
      }
    };

    const checkReminder = () => {
      const now = new Date();
      if (reminderSnoozedUntil) {
        if (Date.now() < reminderSnoozedUntil) return;
        const snoozedTarget = new Date(reminderSnoozedUntil);
        const reminderKey = `deutschly:reminder:${getDayKey(snoozedTarget)}:${state.reminderTime}`;
        const snoozeKey = `deutschly:reminder:snooze:${reminderSnoozedUntil}`;
        setReminderSnoozedUntil(null);
        window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
        if (window.localStorage.getItem(snoozeKey)) return;
        window.localStorage.setItem(snoozeKey, "shown");
        window.localStorage.setItem(reminderKey, "shown");
        showReminder(snoozeKey);
        return;
      }
      const [reminderHours, reminderMinutes] = state.reminderTime.split(":").map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetMinutes = (Number.isFinite(reminderHours) ? reminderHours : 19) * 60 + (Number.isFinite(reminderMinutes) ? reminderMinutes : 0);
      if (currentMinutes < targetMinutes) return;

      const reminderKey = `deutschly:reminder:${getDayKey(now)}:${state.reminderTime}`;
      if (window.localStorage.getItem(reminderKey)) return;
      window.localStorage.setItem(reminderKey, "shown");
      showReminder(reminderKey);
    };

    checkReminder();
    const reminderTimer = window.setInterval(checkReminder, 60_000);
    return () => window.clearInterval(reminderTimer);
  }, [state.reminderEnabled, state.reminderTime, dueCards.length, reminderSnoozedUntil]);

  const handleOpenAddCard = (seed?: Partial<CardDraft>, wordBankId: string | null = null) => {
    setEditingCardId(null);
    setWordBankReviewId(wordBankId);
    setAddCardSeed(seed);
    setAddCardOpen(true);
  };

  const handleAddDatabaseWord = (word: GermanWordRecord, wordBankId?: string) => {
    handleOpenAddCard(germanWordToCardDraft(word), wordBankId ?? null);
  };

  const handleAddWordBankBatch = (wordIds: string[]) => {
    const selectedIds = [...new Set(wordIds)];
    if (selectedIds.length === 0) return;
    const selectedWords = selectedIds
      .map((id) => wordBank.find((word) => word.id === id))
      .filter((word): word is GermanWordRecord => Boolean(word));
    if (selectedWords.length === 0) return;

    const createdAt = new Date().toISOString();
    const batchId = Date.now();
    let addedCount = 0;
    let existingCount = 0;
    let needsReviewCount = 0;
    setState((current) => {
      const nextCards = [...current.cards];
      const wordBankDecisions = { ...current.wordBankDecisions };
      const wordBankDecisionUpdatedAt = { ...current.wordBankDecisionUpdatedAt };

      selectedWords.forEach((word, index) => {
        const preparedDraft = prepareCardDraft(createCardDraft(germanWordToCardDraft(word)));
        const match = findCardMatch(nextCards, preparedDraft);
        if (match?.type === "exact") {
          existingCount += 1;
          wordBankDecisions[word.id] = "added";
          wordBankDecisionUpdatedAt[word.id] = createdAt;
          return;
        }
        if (match?.type === "possible") {
          needsReviewCount += 1;
          return;
        }

        nextCards.unshift({
          id: `custom-${batchId}-${index}`,
          german: preparedDraft.german,
          translation: preparedDraft.translation,
          article: preparedDraft.article,
          partOfSpeech: preparedDraft.partOfSpeech,
          plural: preparedDraft.plural || undefined,
          example: preparedDraft.example || undefined,
          note: preparedDraft.note || undefined,
          tags: normalizeTags(preparedDraft.tags.split(",")),
          sourcePage: preparedDraft.sourcePage,
          lesson: preparedDraft.lesson,
          deck: "My cards",
          kind: preparedDraft.kind,
          due: todayKey,
          interval: 0,
          status: "new",
          stability: 0.7,
          difficulty: 5,
          verification: "unverified",
          updatedAt: createdAt,
        });
        wordBankDecisions[word.id] = "added";
        wordBankDecisionUpdatedAt[word.id] = createdAt;
        addedCount += 1;
      });

      return {
        ...current,
        cards: nextCards,
        wordBankDecisions,
        wordBankDecisionUpdatedAt,
        lastSyncedAt: createdAt,
      };
    });

    const summary = [
      addedCount > 0 ? `${addedCount} card${addedCount === 1 ? "" : "s"} added to your review queue` : "",
      existingCount > 0 ? `${existingCount} already in your library` : "",
      needsReviewCount > 0 ? `${needsReviewCount} need individual review because the meaning may differ` : "",
    ].filter(Boolean).join(" · ");
    showToast(summary || "No cards were added.");
  };

  const handleWordBankDecision = (wordId: string, decision: WordBankDecision) => {
    const updatedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      wordBankDecisions: { ...current.wordBankDecisions, [wordId]: decision },
      wordBankDecisionUpdatedAt: { ...current.wordBankDecisionUpdatedAt, [wordId]: updatedAt },
      lastSyncedAt: updatedAt,
    }));
    showToast(decision === "dismissed" ? "Word moved to Not for me." : "Word moved back to the AI inbox.");
  };

  const handleGenerateWordBatch = async (level: GermanWordBatchLevel, count: number): Promise<GermanWordRecord[]> => {
    const response = await generateGermanWordBatch(syncEndpoint, {
      level,
      count,
      existingWords: wordBank.map((word) => word.german),
    });
    const knownWords = new Set(wordBank.map((word) => normalizeGermanWord(word.german)));
    const additions = response.words.filter((word) => {
      const key = normalizeGermanWord(word.german);
      if (!key || knownWords.has(key)) return false;
      knownWords.add(key);
      return true;
    });
    if (additions.length > 0) {
      const updatedAt = new Date().toISOString();
      setState((current) => {
        const nextWordBank = mergeGermanWordRecords(current.wordBank, additions);
        const nextInboxIds = normalizeWordBankInboxIds(
          [...current.wordBankInboxIds, ...additions.map((word) => word.id)],
          nextWordBank,
        );
        const nextDecisions = { ...current.wordBankDecisions };
        const nextDecisionUpdatedAt = { ...current.wordBankDecisionUpdatedAt };
        additions.forEach((word) => {
          if (!nextDecisions[word.id]) {
            nextDecisions[word.id] = "pending";
            nextDecisionUpdatedAt[word.id] = updatedAt;
          }
        });
        return {
          ...current,
          wordBank: nextWordBank,
          wordBankInboxIds: nextInboxIds,
          wordBankDecisions: nextDecisions,
          wordBankDecisionUpdatedAt: nextDecisionUpdatedAt,
          lastSyncedAt: updatedAt,
        };
      });
    }
    return additions;
  };

  const handleOpenEditCard = (card: Flashcard) => {
    setEditingCardId(card.id);
    setWordBankReviewId(null);
    setAddCardSeed({
      german: card.german,
      translation: card.translation,
      article: card.article,
      partOfSpeech: card.partOfSpeech,
      plural: card.plural ?? "",
      example: card.example ?? "",
      note: card.note ?? "",
      tags: (card.tags ?? []).join(", "),
      sourcePage: card.sourcePage,
      lesson: card.lesson,
      kind: card.kind,
      referenceChecked: card.verification === "reference-checked",
    });
    setAddCardOpen(true);
  };

  const handleCloseAddCard = () => {
    setAddCardOpen(false);
    setAddCardSeed(undefined);
    setEditingCardId(null);
    setWordBankReviewId(null);
  };

  const handleRequestDeleteCard = () => {
    if (!editingCardId) return;
    setAddCardOpen(false);
    setAddCardSeed(undefined);
    setWordBankReviewId(null);
    setDeleteCardId(editingCardId);
    setEditingCardId(null);
  };

  const handleConfirmDeleteCard = () => {
    const cardId = deleteCardId;
    if (!cardId) return;
    const deletedCard = stateRef.current.cards.find((card) => card.id === cardId);
    if (!deletedCard) {
      setDeleteCardId(null);
      return;
    }

    const deletedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
      deletedCardIds: { ...current.deletedCardIds, [cardId]: deletedAt },
      lastSyncedAt: deletedAt,
    }));
    setDeleteCardId(null);
    showToast(`${deletedCard.german} was removed from your library.`, {
      label: "Undo",
      onClick: () => {
        const restoredAt = new Date().toISOString();
        setState((current) => {
          if (current.cards.some((card) => card.id === deletedCard.id)) return current;
          const nextDeletedCardIds = { ...current.deletedCardIds };
          if (nextDeletedCardIds[deletedCard.id] === deletedAt) delete nextDeletedCardIds[deletedCard.id];
          return { ...current, cards: [deletedCard, ...current.cards], deletedCardIds: nextDeletedCardIds, lastSyncedAt: restoredAt };
        });
        showToast(`${deletedCard.german} was restored to your library.`);
      },
    });
  };

  const handleRequestBulkDelete = (ids: string[]) => {
    const existingIds = new Set(stateRef.current.cards.map((card) => card.id));
    const selectedIds = ids.filter((id, index) => existingIds.has(id) && ids.indexOf(id) === index);
    if (selectedIds.length > 0) setBulkDeleteIds(selectedIds);
  };

  const handleConfirmBulkDelete = () => {
    const ids = bulkDeleteIds;
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const deletedCards = stateRef.current.cards.filter((card) => idSet.has(card.id));
    if (deletedCards.length === 0) {
      setBulkDeleteIds(null);
      return;
    }
    const deletedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      cards: current.cards.filter((card) => !idSet.has(card.id)),
      deletedCardIds: { ...current.deletedCardIds, ...Object.fromEntries(deletedCards.map((card) => [card.id, deletedAt])) },
      lastSyncedAt: deletedAt,
    }));
    setBulkDeleteIds(null);
    showToast(`${deletedCards.length} cards were removed from your library.`, {
      label: "Undo",
      onClick: () => {
        const restoredAt = new Date().toISOString();
        setState((current) => {
          const existingIds = new Set(current.cards.map((card) => card.id));
          const restoredCards = deletedCards.filter((card) => !existingIds.has(card.id));
          const nextDeletedCardIds = { ...current.deletedCardIds };
          deletedCards.forEach((card) => {
            if (nextDeletedCardIds[card.id] === deletedAt) delete nextDeletedCardIds[card.id];
          });
          return { ...current, cards: [...restoredCards, ...current.cards], deletedCardIds: nextDeletedCardIds, lastSyncedAt: restoredAt };
        });
        showToast(`${deletedCards.length} cards were restored to your library.`);
      },
    });
  };

  const handleBulkTag = (ids: string[], tag: string) => {
    const normalizedTag = tag.trim().slice(0, 24);
    if (!normalizedTag || ids.length === 0) return;
    const idSet = new Set(ids);
    const updatedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      cards: current.cards.map((card) => idSet.has(card.id) ? { ...card, tags: normalizeTags([...(card.tags ?? []), normalizedTag]), updatedAt } : card),
      lastSyncedAt: updatedAt,
    }));
    showToast(`Added the ${normalizedTag} tag to ${ids.length} cards.`);
  };

  const handleBulkExport = (ids: string[]) => {
    const idSet = new Set(ids);
    const selectedCards = stateRef.current.cards.filter((card) => idSet.has(card.id));
    if (selectedCards.length === 0) return;
    const exportedAt = new Date().toISOString();
    downloadJsonFile(`deutschly-selected-${getDayKey()}.json`, {
      app: "deutschly",
      version: 1,
      profile: profileDisplayName,
      exportedAt,
      wordBank: stateRef.current.wordBank,
      state: { ...stateRef.current, cards: selectedCards, deletedCardIds: {}, lastSyncedAt: exportedAt },
    });
    showToast(`Exported ${selectedCards.length} selected cards.`);
  };

  const handleTabChange = (tab: Tab) => {
    if (tab === "study" && activeTab !== "study" && (studyQueueIds === null || studyQueueIds.length === 0)) {
      setStudyQueueIds(null);
      setStudySession({ reviewed: 0, total: studySessionCapacity });
    }
    setActiveTab(tab);
    if (tab !== "study") setShowAnswer(false);
  };

  const handleStartReview = () => {
    if (dueCards.length === 0) {
      setStudyQueueIds(null);
      setActiveTab("practice");
      setShowAnswer(false);
      return;
    }
    setStudyQueueIds(null);
    setStudySession({ reviewed: 0, total: studySessionCapacity });
    setActiveTab("study");
    setShowAnswer(false);
  };

  const handleStartReviewQueue = (ids: string[]) => {
    const existingIds = new Set(stateRef.current.cards.map((card) => card.id));
    const queueIds = ids.filter((id, index) => existingIds.has(id) && ids.indexOf(id) === index);
    if (queueIds.length === 0) return;
    setStudyQueueIds(queueIds);
    setStudySession({ reviewed: 0, total: queueIds.length });
    setActiveTab("study");
    setShowAnswer(false);
    showToast(`Review queue ready with ${queueIds.length} cards.`);
  };

  const handlePracticeXp = (amount: number) => {
    const safeAmount = Math.max(0, Math.round(amount));
    if (safeAmount === 0) return;
    const previousXp = stateRef.current.xp;
    const previousLevel = getLevelProgress(previousXp).level;
    const nextXp = previousXp + safeAmount;
    const updatedAt = new Date().toISOString();
    const candidateAchievements = nextXp >= 1500 ? ["xp-1500"] : [];
    const newlyUnlocked = getNewAchievementDefinitions(stateRef.current.achievements, candidateAchievements);
    const achievementRewardXp = newlyUnlocked.reduce((sum, achievement) => sum + achievement.rewardXp, 0);
    const nextLevel = getLevelProgress(nextXp + achievementRewardXp).level;
    setState((current) => applyAchievementUnlocks({ ...current, xp: current.xp + safeAmount, lastSyncedAt: updatedAt }, candidateAchievements, updatedAt));
    const messages = newlyUnlocked.length > 0 ? [formatAchievementUnlocks(newlyUnlocked)] : [];
    if (nextLevel > previousLevel) {
      const sessionLength = getPracticeSessionLength(nextLevel, 999);
      messages.push(`Level ${nextLevel} reached. You can now practice up to ${sessionLength} shuffled cards per session.`);
    }
    if (messages.length > 0) showToast(messages.join(" "));
  };

  const handlePracticeComplete = (cardCount: number) => {
    const safeCardCount = Math.max(1, Math.round(cardCount));
    const previousState = stateRef.current;
    const previousReviewsToday = previousState.lastReviewDay === todayKey ? previousState.reviewsToday : 0;
    const completesDailyGoal = previousReviewsToday < previousState.dailyGoal
      && previousReviewsToday + safeCardCount >= previousState.dailyGoal;
    const nextStreak = previousState.lastStudyDay === todayKey
      ? previousState.streak
      : previousState.lastStudyDay === addDays(todayKey, -1) ? previousState.streak + 1 : 1;
    const updatedAt = new Date().toISOString();
    const candidateAchievements = [
      ...(completesDailyGoal ? ["daily-goal"] : []),
      ...(nextStreak >= 7 ? ["week-streak"] : []),
    ];
    const newlyUnlocked = getNewAchievementDefinitions(previousState.achievements, candidateAchievements);
    setState((current) => {
      const reviewsToday = current.lastReviewDay === todayKey ? current.reviewsToday : 0;
      const nextReviewsToday = reviewsToday + safeCardCount;
      const weeklyReviews = [...current.weeklyReviews];
      const lastIndex = weeklyReviews.length - 1;
      if (lastIndex >= 0) weeklyReviews[lastIndex] = (weeklyReviews[lastIndex] ?? 0) + safeCardCount;
      const currentNextStreak = current.lastStudyDay === todayKey
        ? current.streak
        : current.lastStudyDay === addDays(todayKey, -1) ? current.streak + 1 : 1;
      const nextState = {
        ...current,
        reviewsToday: nextReviewsToday,
        lastReviewDay: todayKey,
        lastStudyDay: todayKey,
        streak: currentNextStreak,
        bestStreak: Math.max(current.bestStreak, currentNextStreak),
        weeklyReviews,
        lastSyncedAt: updatedAt,
      };
      return applyAchievementUnlocks(nextState, [
        ...(nextReviewsToday >= current.dailyGoal ? ["daily-goal"] : []),
        ...(currentNextStreak >= 7 ? ["week-streak"] : []),
      ], updatedAt);
    });
    const completionMessage = completesDailyGoal ? "Daily goal complete. Your streak is secured." : `${safeCardCount} practice cards added to today's path.`;
    showToast([completionMessage, newlyUnlocked.length > 0 ? formatAchievementUnlocks(newlyUnlocked) : ""].filter(Boolean).join(" "));
  };

  function handleRate(rating: ReviewRating) {
    const card = studyCards[0];
    if (!card) return;
    const wasQueueSession = studyQueueIds !== null;
    const previousState = stateRef.current;
    const previousCard = previousState.cards.find((item) => item.id === card.id);
    if (!previousCard) return;
    const schedule = scheduleReview(card, rating, todayKey);
    const reviewedAt = new Date().toISOString();
    const xpAward = getXpForRating(rating);
    const wasCorrect = rating !== "again";
    const nextTotalReviews = previousState.totalReviews + 1;
    const nextXp = previousState.xp + xpAward;
    const previousLevel = getLevelProgress(previousState.xp).level;
    const previousReviewsToday = previousState.lastReviewDay === todayKey ? previousState.reviewsToday : 0;
    const nextStreak = previousState.lastStudyDay === todayKey
      ? previousState.streak
      : previousState.lastStudyDay === addDays(todayKey, -1) ? previousState.streak + 1 : 1;
    const candidateAchievements = [
      ...(nextTotalReviews >= 1 ? ["first-review"] : []),
      ...(nextStreak >= 7 ? ["week-streak"] : []),
      ...(previousReviewsToday + 1 >= previousState.dailyGoal ? ["daily-goal"] : []),
      ...(nextXp >= 1500 ? ["xp-1500"] : []),
    ];
    const newlyUnlocked = getNewAchievementDefinitions(previousState.achievements, candidateAchievements);
    const achievementRewardXp = newlyUnlocked.reduce((sum, achievement) => sum + achievement.rewardXp, 0);
    const nextLevel = getLevelProgress(nextXp + achievementRewardXp).level;
    setState((current) => {
      const nextCards = current.cards.map((item) => item.id === card.id ? { ...item, ...schedule, lastReviewedAt: reviewedAt, updatedAt: reviewedAt } : item);
      const weeklyReviews = [...current.weeklyReviews];
      const lastIndex = weeklyReviews.length - 1;
      if (lastIndex >= 0) weeklyReviews[lastIndex] = (weeklyReviews[lastIndex] ?? 0) + 1;
      const reviewsToday = current.lastReviewDay === todayKey ? current.reviewsToday : 0;
      const becameMastered = rating === "easy" && card.status !== "review";
       const nextState = {
        ...current,
        cards: nextCards,
        reviewsToday: reviewsToday + 1,
        lastReviewDay: todayKey,
        lastStudyDay: todayKey,
        studyMinutes: current.studyMinutes + 1,
        mastered: becameMastered ? current.mastered + 1 : current.mastered,
        xp: nextXp,
        totalReviews: nextTotalReviews,
        correctReviews: current.correctReviews + (wasCorrect ? 1 : 0),
        streak: nextStreak,
        bestStreak: Math.max(current.bestStreak, nextStreak),
         weeklyReviews,
         lastSyncedAt: reviewedAt,
       };
       return applyAchievementUnlocks(nextState, candidateAchievements, reviewedAt);
    });
    setStudySession((current) => ({ ...current, reviewed: Math.min(current.reviewed + 1, Math.max(current.total, 1)) }));
    if (wasQueueSession) {
      setStudyQueueIds((current) => current ? current.filter((id) => id !== card.id) : current);
    }
    setShowAnswer(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    const ratingMessage = `${rating === "again" ? "We’ll bring it back tomorrow" : `Next review in ${schedule.interval} days`} · +${xpAward} XP`;
    const levelMessage = nextLevel > previousLevel ? `Level ${nextLevel} reached. Your practice capacity is now ${getPracticeSessionLength(nextLevel, 999)} cards.` : "";
    showToast([ratingMessage, newlyUnlocked.length > 0 ? formatAchievementUnlocks(newlyUnlocked) : "", levelMessage].filter(Boolean).join(" "), {
      label: "Undo",
      onClick: () => {
        const restoredAt = new Date().toISOString();
        setState((current) => ({
          ...current,
          cards: current.cards.map((item) => item.id === previousCard.id ? previousCard : item),
          reviewsToday: previousState.reviewsToday,
          lastReviewDay: previousState.lastReviewDay,
          lastStudyDay: previousState.lastStudyDay,
          studyMinutes: previousState.studyMinutes,
          mastered: previousState.mastered,
          xp: previousState.xp,
          totalReviews: previousState.totalReviews,
          correctReviews: previousState.correctReviews,
          streak: previousState.streak,
          bestStreak: previousState.bestStreak,
          achievements: [...previousState.achievements],
          achievementUnlockedAt: { ...previousState.achievementUnlockedAt },
          weeklyReviews: [...previousState.weeklyReviews],
          lastSyncedAt: restoredAt,
        }));
        setStudySession((current) => ({ ...current, reviewed: Math.max(0, current.reviewed - 1) }));
        if (wasQueueSession) setStudyQueueIds((current) => current && !current.includes(previousCard.id) ? [previousCard.id, ...current] : current);
        setShowAnswer(false);
        showToast(`${previousCard.german} review undone.`);
      },
    });
  }

  const handleSaveCard = (draft: CardDraft) => {
    const preparedDraft = prepareCardDraft(draft);
    const wordBankId = wordBankReviewId;
    const duplicate = findCardMatch(state.cards.filter((card) => card.id !== editingCardId), preparedDraft);
    if (duplicate?.type === "exact") {
      if (wordBankId) {
        const updatedAt = new Date().toISOString();
        setState((current) => ({
          ...current,
          wordBankDecisions: { ...current.wordBankDecisions, [wordBankId]: "added" },
          wordBankDecisionUpdatedAt: { ...current.wordBankDecisionUpdatedAt, [wordBankId]: updatedAt },
          lastSyncedAt: updatedAt,
        }));
        handleCloseAddCard();
        showToast(`${duplicate.card.german} is already in your library. Marked as added.`);
      } else {
        showToast(`${duplicate.card.german} is already in your library`);
      }
      return;
    }

    const createdAt = new Date().toISOString();
    if (editingCardId) {
      setState((current) => ({
        ...current,
        cards: current.cards.map((card) => card.id === editingCardId ? {
          ...card,
          german: preparedDraft.german,
          translation: preparedDraft.translation,
          article: preparedDraft.article,
          partOfSpeech: preparedDraft.partOfSpeech,
          plural: preparedDraft.plural || undefined,
          example: preparedDraft.example || undefined,
          note: preparedDraft.note || undefined,
          tags: normalizeTags(preparedDraft.tags.split(",")),
          sourcePage: preparedDraft.sourcePage,
          lesson: preparedDraft.lesson,
          kind: preparedDraft.kind,
          verification: preparedDraft.referenceChecked ? "reference-checked" : "unverified",
          updatedAt: createdAt,
        } : card),
        lastSyncedAt: createdAt,
      }));
      handleCloseAddCard();
      showToast(`${preparedDraft.german} was updated`);
      return;
    }

    const newCard: Flashcard = {
      id: `custom-${Date.now()}`,
      german: preparedDraft.german,
      translation: preparedDraft.translation,
      article: preparedDraft.article,
      partOfSpeech: preparedDraft.partOfSpeech,
      plural: preparedDraft.plural || undefined,
      example: preparedDraft.example || undefined,
      note: preparedDraft.note || undefined,
      tags: normalizeTags(preparedDraft.tags.split(",")),
      sourcePage: preparedDraft.sourcePage,
      lesson: preparedDraft.lesson,
      deck: "My cards",
      kind: preparedDraft.kind,
      due: todayKey,
      interval: 0,
      status: "new",
      stability: 0.7,
      difficulty: 5,
      verification: preparedDraft.referenceChecked ? "reference-checked" : "unverified",
      updatedAt: createdAt,
    };
    setState((current) => {
      const shouldMarkCandidateAccepted = Boolean(
        preparedDraft.sourceCandidateId
        && current.pdfImport?.candidates.some((candidate) => candidate.id === preparedDraft.sourceCandidateId),
      );
      const pdfImport = shouldMarkCandidateAccepted && current.pdfImport && preparedDraft.sourceCandidateId
        ? {
          ...current.pdfImport,
          candidateStatuses: { ...current.pdfImport.candidateStatuses, [preparedDraft.sourceCandidateId]: "accepted" as const },
          candidateStatusUpdatedAt: { ...current.pdfImport.candidateStatusUpdatedAt, [preparedDraft.sourceCandidateId]: createdAt },
        }
        : current.pdfImport;
      return {
        ...current,
        cards: [newCard, ...current.cards],
        pdfImport,
        wordBankDecisions: wordBankId
          ? { ...current.wordBankDecisions, [wordBankId]: "added" }
          : current.wordBankDecisions,
        wordBankDecisionUpdatedAt: wordBankId
          ? { ...current.wordBankDecisionUpdatedAt, [wordBankId]: createdAt }
          : current.wordBankDecisionUpdatedAt,
        lastSyncedAt: createdAt,
      };
    });
    handleCloseAddCard();
    showToast(`${newCard.german} was added to your review queue`);
  };

  const handleSaveSyncSettings = () => {
    const endpoint = syncEndpoint.trim();
    const room = normalizeSyncRoom(syncRoom);
    if (!endpoint) {
      setSyncError("Enter a sync server URL first.");
      return;
    }
    if (room.length < 6) {
      setSyncError("The room code needs at least 6 letters or numbers.");
      return;
    }

    setSyncEndpoint(endpoint);
    setSyncRoom(room);
    window.localStorage.setItem(SYNC_ENDPOINT_KEY, endpoint);
    window.localStorage.setItem(SYNC_ROOM_KEY, room);
    window.localStorage.setItem(AUTO_SYNC_KEY, String(autoSync));
    lastAutoSyncFingerprintRef.current = "";
    setSyncConflict(null);
    setSyncError(null);
    setSyncStatus("idle");
    setSyncOpen(false);
    showToast(autoSync ? "Sync connection saved. Auto-sync is on." : "Sync connection saved. Tap Sync now when both devices are ready.");
  };

  const handleSync = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (syncInFlightRef.current) return;
    if (syncConflict) {
      setSyncOpen(true);
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
      setSyncError("You are offline. Local changes are safe and will sync when the connection returns.");
      if (!silent) setSyncOpen(true);
      return;
    }
    if (!syncConfigured) {
      setSyncStatus("offline");
      if (!silent) {
        setSyncError(null);
        setSyncOpen(true);
      }
      return;
    }

    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncStatus("syncing");
    setSyncError(null);
    const localState = stateRef.current;
    try {
      const remote = await pullSync(syncEndpoint, syncRoom);
      const remoteState = remote ? normalizeAppState(remote.state) : null;
      const baselineFingerprint = lastAutoSyncFingerprintRef.current || loadLocalSetting(getSyncBaselineStorageKey(syncEndpoint, syncRoom));
      const localFingerprint = getSyncFingerprint(localState);
      const remoteFingerprint = remoteState ? getSyncFingerprint(remoteState) : "";
      const hasConflict = Boolean(remoteState && baselineFingerprint && localFingerprint !== baselineFingerprint && remoteFingerprint !== baselineFingerprint && localFingerprint !== remoteFingerprint);
      if (hasConflict && remoteState) {
        setSyncConflict({
          remoteState,
          remoteUpdatedAt: remote?.updatedAt ?? "",
          localCardCount: localState.cards.length,
          remoteCardCount: remoteState.cards.length,
        });
        setSyncStatus("conflict");
        setSyncError("Changes were made on both devices. Choose how to continue.");
        setSyncOpen(true);
        showToast("Changes found on both devices. Choose how to continue.");
        return;
      }
      const mergedState = remoteState ? mergeAppStates(localState, remoteState) : localState;
      const response = await pushSync(syncEndpoint, syncRoom, mergedState);
      const syncedAt = response.updatedAt || new Date().toISOString();
      const syncedFingerprint = getSyncFingerprint(mergedState);
      lastAutoSyncFingerprintRef.current = syncedFingerprint;
      window.localStorage.setItem(getSyncBaselineStorageKey(syncEndpoint, syncRoom), syncedFingerprint);
      setState((current) => ({ ...mergeAppStates(current, mergedState), lastSyncedAt: syncedAt }));
      setSyncConflict(null);
      setSyncStatus("synced");
      if (!silent) showToast(remote ? `Synced ${mergedState.cards.length} cards across devices.` : "Sync room created. Your cards are ready on the other device.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The sync server could not be reached.";
      setSyncError(message);
      setSyncStatus(error instanceof Error && "status" in error && (error as { status?: number }).status === 0 ? "offline" : "error");
      if (!silent) {
        setSyncOpen(true);
        showToast("Sync failed. Check the server URL and room code.");
      }
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  };

  const handleResolveSyncConflict = async (resolution: SyncResolution) => {
    if (!syncConflict || !syncConfigured || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncStatus("syncing");
    setSyncError(null);
    const localState = stateRef.current;
    const resolvedState = resolution === "local"
      ? localState
      : resolution === "remote"
        ? syncConflict.remoteState
        : mergeAppStates(localState, syncConflict.remoteState);
    try {
      const response = await pushSync(syncEndpoint, syncRoom, resolvedState);
      const syncedAt = response.updatedAt || new Date().toISOString();
      const syncedFingerprint = getSyncFingerprint(resolvedState);
      lastAutoSyncFingerprintRef.current = syncedFingerprint;
      window.localStorage.setItem(getSyncBaselineStorageKey(syncEndpoint, syncRoom), syncedFingerprint);
      setState({ ...resolvedState, lastSyncedAt: syncedAt });
      setSyncConflict(null);
      setSyncStatus("synced");
      setSyncOpen(false);
      const message = resolution === "merge"
        ? `Merged ${resolvedState.cards.length} cards across devices.`
        : resolution === "local"
          ? "This device replaced the shared copy."
          : "The shared copy is now on this device.";
      showToast(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The sync server could not be reached.";
      setSyncError(message);
      setSyncStatus(error instanceof Error && "status" in error && (error as { status?: number }).status === 0 ? "offline" : "error");
      setSyncOpen(true);
      showToast("Sync resolution failed. Check the server and try again.");
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  };

  const handleFirebaseSync = async ({ silent = false, strategy = "merge", pending, promptForChoice = false }: { silent?: boolean; strategy?: FirebaseSyncStrategy; pending?: FirebaseMergePrompt; promptForChoice?: boolean } = {}) => {
    if (!firebaseConfigured || !firebaseUser || firebaseSyncInFlightRef.current || (firebaseMergePrompt && !pending)) return;
    firebaseSyncInFlightRef.current = true;
    setFirebaseBusy(true);
    setFirebaseError(null);
    const localState = stateRef.current;
    try {
      const remote = pending ? { state: pending.remoteState, profileName: pending.remoteProfileName } : await loadFirebaseCloudDocument(firebaseUser.uid);
      const remoteState = remote ? normalizeAppState(remote.state) : null;
      const shouldPrompt = !pending
        && Boolean(remoteState)
        && (promptForChoice || firebaseChoiceRequiredRef.current === firebaseUser.uid)
        && (localState.cards.length > 0 || localState.wordBank.length > 0)
        && getSyncFingerprint(localState) !== getSyncFingerprint(remoteState as AppState);
      if (shouldPrompt && remoteState) {
        firebaseChoiceRequiredRef.current = firebaseUser.uid;
        setFirebaseMergePrompt({ remoteState, remoteProfileName: remote?.profileName ? normalizeProfileName(remote.profileName) : "" });
        return;
      }
      const resolvedState = strategy === "local"
        ? localState
        : strategy === "remote"
          ? remoteState ?? localState
          : remoteState ? mergeAppStates(localState, remoteState) : localState;
      const remoteProfileName = remote?.profileName ? normalizeProfileName(remote.profileName) : "";
      const currentProfileName = profileNameRef.current;
      const resolvedProfileName = strategy === "remote"
        ? isValidProfileName(remoteProfileName) ? remoteProfileName : currentProfileName
        : currentProfileName || (isValidProfileName(remoteProfileName) ? remoteProfileName : "");
      if (resolvedProfileName && resolvedProfileName !== currentProfileName && !profileOnboardingOpen) {
        setProfileName(resolvedProfileName);
        profileNameRef.current = resolvedProfileName;
        window.localStorage.setItem(PROFILE_NAME_KEY, resolvedProfileName);
        setProfileOnboardingOpen(false);
      }
      const syncedAt = await saveFirebaseCloudDocument(firebaseUser.uid, { state: resolvedState, profileName: resolvedProfileName });
      lastFirebaseSyncFingerprintRef.current = getSyncFingerprint(resolvedState);
      firebaseChoiceRequiredRef.current = "";
      setFirebaseMergePrompt(null);
      setState({ ...resolvedState, lastSyncedAt: syncedAt });
      if (!silent) {
        const message = strategy === "merge"
          ? remote ? `Merged ${resolvedState.cards.length} cards to your account.` : "Your cards are now backed up to your account."
          : strategy === "local" ? "This device replaced the Google copy."
            : "Your Google cards are now on this device.";
        showToast(message);
      }
    } catch (error: unknown) {
      setFirebaseError(firebaseErrorMessage(error, "sync"));
      if (!silent) showToast("Cloud sync failed. Check the Firebase setup and try again.");
    } finally {
      firebaseSyncInFlightRef.current = false;
      setFirebaseBusy(false);
    }
  };

  const handleFirebaseMergeChoice = (strategy: FirebaseSyncStrategy) => {
    const pending = firebaseMergePrompt;
    if (!pending) return;
    setFirebaseMergePrompt(null);
    void handleFirebaseSync({ strategy, pending });
  };

  const handleFirebaseSignIn = async (provider: FirebaseAuthProvider) => {
    if (!firebaseConfigured) {
      setFirebaseError("Firebase setup is still needed for account sign-in.");
      return;
    }
    setFirebaseBusy(true);
    setFirebaseError(null);
    try {
      const useRedirect = shouldUseFirebaseRedirect();
      const user = await signInWithFirebaseProvider(provider, useRedirect);
      if (user) {
        setFirebaseUser(user);
        showToast(`Signed in with ${provider === "google" ? "Google" : "GitHub"}.`);
      }
    } catch (error: unknown) {
      setFirebaseError(firebaseErrorMessage(error, "auth"));
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handleFirebaseSignOut = async () => {
    setFirebaseBusy(true);
    setFirebaseError(null);
    try {
      await signOutFromFirebase();
      setFirebaseUser(null);
      firebaseAuthSyncUserRef.current = "";
      firebaseChoiceRequiredRef.current = "";
      lastFirebaseSyncFingerprintRef.current = "";
      setFirebaseMergePrompt(null);
      showToast("Signed out. Your local cards remain on this device.");
    } catch (error: unknown) {
      setFirebaseError(firebaseErrorMessage(error));
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handleRequestDeleteFirebaseAccount = () => {
    if (!firebaseUser) return;
    setFirebaseError(null);
    setProfileOpen(false);
    setDeleteAccountOpen(true);
  };

  const handleDeleteFirebaseAccount = async () => {
    if (!firebaseUser || firebaseBusy) return;
    setFirebaseBusy(true);
    setFirebaseError(null);
    try {
      await deleteFirebaseAccount();
      setFirebaseUser(null);
      firebaseAuthSyncUserRef.current = "";
      firebaseChoiceRequiredRef.current = "";
      lastFirebaseSyncFingerprintRef.current = "";
      setFirebaseMergePrompt(null);
      window.localStorage.setItem(PROFILE_MODE_KEY, "guest");
      setDeleteAccountOpen(false);
      showToast("Google account and cloud data deleted. Local cards remain on this device.");
    } catch (error: unknown) {
      setFirebaseError(firebaseErrorMessage(error));
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handleDeferFirebaseMerge = () => {
    setFirebaseMergePrompt(null);
    showToast("Account connected. Choose a sync option from Settings when you are ready.");
  };

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser || profileOnboardingOpen || firebaseAuthSyncUserRef.current === firebaseUser.uid) return;
    firebaseAuthSyncUserRef.current = firebaseUser.uid;
    void handleFirebaseSync({ silent: true, promptForChoice: true });
  }, [firebaseConfigured, firebaseUser?.uid, profileOnboardingOpen]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser || !lastFirebaseSyncFingerprintRef.current || lastFirebaseSyncFingerprintRef.current === syncFingerprint) return undefined;
    const timer = window.setTimeout(() => void handleFirebaseSync({ silent: true }), 900);
    return () => window.clearTimeout(timer);
  }, [firebaseConfigured, firebaseUser?.uid, syncFingerprint]);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseUser || !profileName || !lastFirebaseSyncFingerprintRef.current) return undefined;
    const timer = window.setTimeout(() => void handleFirebaseSync({ silent: true }), 900);
    return () => window.clearTimeout(timer);
  }, [firebaseConfigured, firebaseUser?.uid, profileName]);

  const handleTestConnection = async () => {
    if (testingConnection || !syncEndpoint.trim()) return;
    setTestingConnection(true);
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      await checkSyncHealth(syncEndpoint);
      setSyncStatus("synced");
      showToast("Sync server is reachable.");
    } catch (error) {
      setSyncStatus(error instanceof Error && "status" in error && (error as { status?: number }).status === 0 ? "offline" : "error");
      setSyncError(error instanceof Error ? error.message : "The sync server could not be reached.");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCopyRoom = async () => {
    if (syncRoom.length < 6) return;
    try {
      await navigator.clipboard.writeText(syncRoom);
      showToast("Room code copied.");
    } catch {
      showToast(`Room code: ${syncRoom}`);
    }
  };

  useEffect(() => {
    if (!autoSync || !syncConfigured) {
      autoSyncReadyRef.current = false;
      lastAutoSyncFingerprintRef.current = "";
      return undefined;
    }

    if (!autoSyncReadyRef.current) {
      autoSyncReadyRef.current = true;
      void handleSync({ silent: true });
      return undefined;
    }

    if (lastAutoSyncFingerprintRef.current === syncFingerprint) return undefined;
    const timer = window.setTimeout(() => void handleSync({ silent: true }), 900);
    return () => window.clearTimeout(timer);
  }, [autoSync, syncConfigured, syncEndpoint, syncRoom, syncFingerprint]);

  useEffect(() => {
    if (!autoSync || !syncConfigured) return undefined;
    const timer = window.setInterval(() => void handleSync({ silent: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [autoSync, syncConfigured, syncEndpoint, syncRoom]);

  useEffect(() => {
    if (!autoSync || !syncConfigured) return undefined;
    const syncWhenAvailable = () => {
      if (navigator.onLine && document.visibilityState === "visible") void handleSync({ silent: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncWhenAvailable();
    };
    window.addEventListener("online", syncWhenAvailable);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", syncWhenAvailable);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [autoSync, syncConfigured, syncEndpoint, syncRoom]);

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setPdfError(null);
    setPdfLoading(true);

    try {
      const result = await extractMenschenPdf(file);
      const extractedAt = new Date().toISOString();
      setState((current) => ({
        ...current,
        sourceFileName: file.name,
        pdfImport: {
          fileName: file.name,
          pageCount: result.pageCount,
          candidateCount: result.candidates.length,
          textPreview: result.textPreview,
          extractedAt,
          candidates: result.candidates,
          candidateStatuses: normalizePdfCandidateStatuses(result.candidates, undefined),
          candidateStatusUpdatedAt: {},
        },
        lastSyncedAt: extractedAt,
      }));
      setPdfCandidates(result.candidates);
      setActiveTab("library");
      showToast(`${file.name} read locally · ${result.candidates.length} word suggestions found`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The PDF could not be read.";
      setPdfError(message);
      setPdfCandidates([]);
      showToast("The PDF could not be imported");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportBackup = () => {
    const payload = JSON.stringify({ app: "deutschly", version: 1, profile: profileDisplayName, exportedAt: new Date().toISOString(), wordBank: state.wordBank, state }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `deutschly-${getDayKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Backup exported. You can import it on another device.");
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    try {
      const parsed: unknown = JSON.parse(await file.text());
      const importedValue = isRecord(parsed) && "state" in parsed ? parsed.state : parsed;
      if (!isRecord(importedValue) || !Array.isArray(importedValue.cards)) throw new Error("This file is not a Deutschly backup.");
      const importedWordBank = isRecord(parsed) && Array.isArray(parsed.wordBank) ? parsed.wordBank.filter(isGermanWordRecord) : [];
      const importedState = normalizeAppState({
        ...importedValue,
        wordBank: mergeGermanWordRecords(
          Array.isArray(importedValue.wordBank) ? importedValue.wordBank.filter(isGermanWordRecord) : [],
          importedWordBank,
        ),
      });
      setState({ ...importedState, lastSyncedAt: new Date().toISOString() });
      setPdfCandidates(importedState.pdfImport?.candidates ?? []);
      setPdfError(null);
      setActiveTab("library");
      showToast(`Imported ${importedState.cards.length} cards from backup`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The backup could not be imported");
    }
  };

  const handlePdfCandidateStatusChange = (candidateId: string, status: PdfCandidateStatus) => {
    const updatedAt = new Date().toISOString();
    setState((current) => {
      if (!current.pdfImport?.candidates.some((candidate) => candidate.id === candidateId)) return current;
      const candidateStatuses = normalizePdfCandidateStatuses(current.pdfImport.candidates, current.pdfImport.candidateStatuses);
      return {
        ...current,
        pdfImport: {
          ...current.pdfImport,
          candidateStatuses: { ...candidateStatuses, [candidateId]: status },
          candidateStatusUpdatedAt: { ...current.pdfImport.candidateStatusUpdatedAt, [candidateId]: updatedAt },
        },
        lastSyncedAt: updatedAt,
      };
    });
    showToast(status === "skipped" ? "Suggestion moved to skipped." : status === "pending" ? "Suggestion moved back to the review inbox." : "Suggestion marked as added.");
  };

  const handleUsePdfCandidate = (candidate: PdfCandidate) => {
    handleOpenAddCard({
      german: candidate.german,
      article: candidate.article,
      sourcePage: candidate.page,
      lesson: candidate.lesson ?? "Personal cards",
      tags: "Menschen, PDF",
      note: `Suggested from ${state.sourceFileName || "Menschen PDF"}, ${candidate.lesson ? `${candidate.lesson}, ` : ""}page ${candidate.page}. ${candidate.context}`,
      sourceCandidateId: candidate.id,
    });
  };

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      showToast("This browser does not support notifications. Calendar reminders are still available.");
      return;
    }
    if (Notification.permission === "granted") {
      setNotificationPermission("granted");
      showToast("Browser notifications are already enabled.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      showToast(permission === "granted" ? "Browser notifications are enabled." : permission === "denied" ? "Notifications are blocked. Calendar reminders are still available." : "Notification permission was not changed.");
    } catch {
      setNotificationPermission("unsupported");
      showToast("Notifications could not be enabled. Calendar reminders are still available.");
    }
  };
  const handleReminderToggle = async () => {
    const nextEnabled = !state.reminderEnabled;
    if (nextEnabled && notificationPermission === "default") await handleEnableNotifications();
    setState((current) => ({ ...current, reminderEnabled: nextEnabled }));
    if (!nextEnabled) {
      setReminderSnoozedUntil(null);
      window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
    }
  };
  const handleReminderTimeChange = (reminderTime: string) => {
    setState((current) => ({ ...current, reminderTime }));
    setReminderSnoozedUntil(null);
    window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
  };
  const handleDailyGoalChange = (value: number) => {
    if (!Number.isFinite(value)) return;
    const dailyGoal = Math.max(1, Math.min(100, Math.round(value)));
    setState((current) => ({ ...current, dailyGoal }));
  };
  const handleSnoozeReminder = () => {
    if (reminderSnoozedUntil) {
      setReminderSnoozedUntil(null);
      window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
      showToast(`Snooze cancelled. Your regular reminder stays at ${formatTimeLabel(state.reminderTime)}.`);
      return;
    }
    const until = getNextSnoozeAt(state.reminderTime).getTime();
    setReminderSnoozedUntil(until);
    window.localStorage.setItem(REMINDER_SNOOZE_KEY, String(until));
    showToast(`Reminder snoozed until ${formatReminderTarget(new Date(until))}.`);
  };
  const handleAddReminderToCalendar = () => {
    downloadReminderCalendar(state.reminderTime);
    showToast("Daily review reminder added to your calendar file.");
  };
  const handleReminderBell = async () => {
    if (!state.reminderEnabled) {
      showToast("Reminders are paused. Turn them on from the Overview page.");
      return;
    }
    if (notificationPermission === "default") {
      await handleEnableNotifications();
      return;
    }
    if (notificationPermission === "denied") {
      showToast("Notifications are blocked. Calendar reminders are still available.");
      return;
    }
    showToast(notificationPermission === "granted" ? `Reminder set for ${formatTimeLabel(state.reminderTime)}.` : "In-app reminders stay on while this page is open.");
  };
  const handleSaveProfile = (nextName: string) => {
    const trimmedName = normalizeProfileName(nextName);
    if (!isValidProfileName(trimmedName)) {
      showToast("Use Latin letters only for your profile name.");
      return;
    }
    setProfileName(trimmedName);
    window.localStorage.setItem(PROFILE_NAME_KEY, trimmedName);
    setProfileOpen(false);
    showToast("Profile updated.");
  };
  const handleCompleteProfileOnboarding = (nextName: string, mode: ProfileMode) => {
    const trimmedName = normalizeProfileName(nextName);
    if (!isValidProfileName(trimmedName)) return;
    profileNameRef.current = trimmedName;
    setProfileName(trimmedName);
    window.localStorage.setItem(PROFILE_NAME_KEY, trimmedName);
    window.localStorage.setItem(PROFILE_MODE_KEY, mode);
    setProfileOnboardingOpen(false);
    showToast(mode === "google" ? `Welcome to Deutschly, ${trimmedName}. Your cards can now sync across devices.` : `Welcome to Deutschly, ${trimmedName}. Guest mode is saved on this device.`);
  };
  const handleViewWeakCards = () => {
    setWeakCardsOnly(true);
    setActiveTab("library");
    showToast("Showing cards that need another gentle pass.");
  };
  const handleResetProgress = () => {
    const resetAt = new Date().toISOString();
    const cardCount = stateRef.current.cards.length;
    setState((current) => resetLearningProgress(current, todayKey, resetAt));
    setStudySession({ reviewed: 0, total: cardCount });
    setShowAnswer(false);
    setWeakCardsOnly(false);
    setResetProgressOpen(false);
    showToast("Progress reset. Your cards are ready to learn from the beginning.");
  };
  const handleThemeChange = (theme: Theme) => setState((current) => ({ ...current, theme }));
  const toggleTheme = () => handleThemeChange(state.theme === "light" ? "dark" : "light");
  const handleOpenSyncFromSettings = () => {
    setProfileOpen(false);
    setSyncOpen(true);
  };
  const handleResetProgressFromSettings = () => {
    setProfileOpen(false);
    setResetProgressOpen(true);
  };
  const handleDismissInstallPrompt = () => {
    setInstallDismissed(true);
    window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
  };
  const handleInstallApp = async () => {
    const installed = await installPrompt.install();
    if (!installed) {
      setInstallDismissed(true);
      window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
      return;
    }
    setInstallDismissed(true);
    window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
    showToast("Deutschly was installed. Your review space is ready from the home screen.");
  };

  return (
    <div className="app-shell" data-theme={state.theme}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="brand"><span className="brand__mark" aria-hidden="true"><BookOpen size={20} strokeWidth={2.4} /></span><span className="brand__word">deutschly</span><span className="brand__beta">BETA</span></div>
          <button type="button" className="sidebar__course" onClick={() => handleTabChange("library")} aria-label="Open Menschen A1.1 in your library"><span className="course-dot" aria-hidden="true" /><span><strong>Menschen A1.1</strong><span>German foundations</span></span><ChevronRight size={15} aria-hidden="true" /></button>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <span className="sidebar-nav__label">Workspace</span>
            {navItems.map(({ id, label, icon: Icon }) => (
              <button type="button" className={`nav-item${activeTab === id ? " nav-item--active" : ""}`} key={id} onClick={() => handleTabChange(id)} aria-current={activeTab === id ? "page" : undefined}>
                <Icon size={18} strokeWidth={activeTab === id ? 2.3 : 2} aria-hidden="true" />
                <span>{label}</span>
                {id === "study" && dueCards.length > 0 && <span className="nav-item__badge">{dueCards.length}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar__bottom">
          <div className="sidebar-tip"><Sparkles size={16} aria-hidden="true" /><div><strong>Small steps, big recall.</strong><span>Your next review is ready.</span></div></div>
          <div className="sidebar-profile"><div className="avatar" role="img" aria-label={`${profileDisplayName} profile avatar`}><ProfileAvatar name={profileDisplayName} dayKey={todayKey} photoURL={firebaseUser?.photoURL} size={32} /></div><div><strong>{profileDisplayName}</strong><span>Personal learner</span></div><button type="button" className="icon-button icon-button--small" onClick={() => setProfileOpen(true)} aria-label="Open profile settings" title="Profile settings"><Settings size={16} aria-hidden="true" /></button></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__context"><div className="mobile-brand"><span className="brand__mark" aria-hidden="true"><BookOpen size={18} /></span><span className="brand__word">deutschly</span></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{navItems.find((item) => item.id === activeTab)?.label}</strong></div></div>
          <div className="topbar__actions">
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={state.theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={state.theme === "light" ? "Dark mode" : "Light mode"}>{state.theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</button>
            <button type="button" className="icon-button notification-button" onClick={handleReminderBell} aria-label="View reminders" title="Reminders"><Bell size={18} aria-hidden="true" />{state.reminderEnabled && dueCards.length > 0 && <span aria-hidden="true" />}</button>
            <button type="button" className={`sync-button${syncing ? " sync-button--syncing" : ""}`} onClick={() => void handleSync()} disabled={syncing}><Cloud size={16} aria-hidden="true" />{syncing ? "Syncing..." : syncConfigured ? "Sync now" : "Set up sync"}</button>
            <button type="button" className="topbar__avatar" onClick={() => setProfileOpen(true)} aria-label={`Open profile settings for ${profileDisplayName}`} title="Profile settings"><ProfileAvatar name={profileDisplayName} dayKey={todayKey} photoURL={firebaseUser?.photoURL} size={34} /></button>
          </div>
        </header>

        <main id="main-content" className="main-content">
          {activeTab === "overview" && <OverviewPage state={state} profileName={profileDisplayName} dueCards={dueCards} currentTime={currentTime} onStartReview={handleStartReview} onAddCard={() => handleOpenAddCard()} onOpenLibrary={() => handleTabChange("library")} onViewProgress={() => handleTabChange("progress")} onReminderToggle={handleReminderToggle} onReminderTimeChange={handleReminderTimeChange} onSnoozeReminder={handleSnoozeReminder} onAddReminderToCalendar={handleAddReminderToCalendar} notificationPermission={notificationPermission} onEnableNotifications={handleEnableNotifications} reminderSnoozedUntil={reminderSnoozedUntil} />}
          {activeTab === "study" && <StudyPage dueCards={studyCards} sessionReviewed={studySession.reviewed} sessionTotal={studySession.total} queueSession={studyQueueIds !== null} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={handleRate} onBack={() => handleTabChange("overview")} onAddCard={() => handleOpenAddCard()} onContinueReview={handleStartReview} hasMoreDueCards={studyQueueIds === null && studySession.total > 0 && studySession.reviewed >= studySession.total && dueCards.length > 0} remainingDueCards={dueCards.length} />}
          {activeTab === "practice" && <PracticePage cards={state.cards} level={getLevelProgress(state.xp).level} onAddCard={() => handleOpenAddCard()} onAwardXp={handlePracticeXp} onCompleteSession={handlePracticeComplete} />}
          {activeTab === "library" && <LibraryPage cards={state.cards} searchQuery={searchQuery} sourceFileName={state.sourceFileName} sourcePageCount={state.pdfImport?.pageCount ?? 0} sourceCandidateCount={state.pdfImport?.candidateCount ?? 0} sourcePreview={state.pdfImport?.textPreview ?? ""} pdfCandidates={pdfCandidates} pdfCandidateStatuses={state.pdfImport?.candidateStatuses ?? {}} pdfLoading={pdfLoading} pdfError={pdfError} onSearch={setSearchQuery} onAddCard={() => handleOpenAddCard()} onAddDatabaseWord={handleAddDatabaseWord} onAddWordBankBatch={handleAddWordBankBatch} onOpenSync={handleOpenSyncFromSettings} wordBank={wordBank} wordBankInboxItems={wordBankInboxItems} onWordBankDecision={handleWordBankDecision} onGenerateWordBatch={handleGenerateWordBatch} aiEndpoint={syncEndpoint} onEditCard={handleOpenEditCard} weakCardsOnly={weakCardsOnly} onWeakCardsOnlyChange={setWeakCardsOnly} onPdfUpload={handlePdfUpload} onUsePdfCandidate={handleUsePdfCandidate} onPdfCandidateStatusChange={handlePdfCandidateStatusChange} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} onBulkDelete={handleRequestBulkDelete} onBulkTag={handleBulkTag} onBulkExport={handleBulkExport} onStartReviewQueue={handleStartReviewQueue} />}
          {activeTab === "progress" && <ProgressPage state={state} onViewWeakCards={handleViewWeakCards} onAdjustReminder={() => handleTabChange("overview")} onStartReview={handleStartReview} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={`mobile-nav__item${activeTab === id ? " mobile-nav__item--active" : ""}`} onClick={() => handleTabChange(id)} aria-current={activeTab === id ? "page" : undefined}>
            <span className="mobile-nav__icon"><Icon size={18} aria-hidden="true" />{id === "study" && dueCards.length > 0 && <span>{dueCards.length}</span>}</span><small>{id === "study" ? "Study" : label.replace("My ", "")}</small>
          </button>
        ))}
      </nav>

      {addCardOpen && <AddCardModal onClose={handleCloseAddCard} onSave={handleSaveCard} onDelete={editingCardId ? handleRequestDeleteCard : undefined} existingCards={state.cards.filter((card) => card.id !== editingCardId)} initialDraft={addCardSeed} editing={Boolean(editingCardId)} geminiEndpoint={syncEndpoint} />}
      {cardPendingDeletion && <DeleteCardModal card={cardPendingDeletion} onClose={() => setDeleteCardId(null)} onConfirm={handleConfirmDeleteCard} />}
      {profileOpen && <ProfileModal
        name={profileDisplayName}
        theme={state.theme}
        dailyGoal={state.dailyGoal}
        reminderEnabled={state.reminderEnabled}
        reminderTime={state.reminderTime}
        notificationPermission={notificationPermission}
        reminderSnoozedUntil={reminderSnoozedUntil}
        currentTime={currentTime}
        cardCount={state.cards.length}
        syncConfigured={syncConfigured}
        canInstall={installPrompt.canInstall}
        isInstalled={installPrompt.isInstalled}
        isIos={installPrompt.isIos}
        isMobile={installPrompt.isMobile}
        onClose={() => setProfileOpen(false)}
        onSave={handleSaveProfile}
        onThemeChange={handleThemeChange}
        onDailyGoalChange={handleDailyGoalChange}
        onReminderToggle={handleReminderToggle}
        onReminderTimeChange={handleReminderTimeChange}
        onEnableNotifications={handleEnableNotifications}
        onSnoozeReminder={handleSnoozeReminder}
        onAddReminderToCalendar={handleAddReminderToCalendar}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onOpenSync={handleOpenSyncFromSettings}
        onResetProgress={handleResetProgressFromSettings}
        onInstallApp={() => { void handleInstallApp(); }}
        firebaseConfigured={firebaseConfigured}
        firebaseUser={firebaseUser}
        firebaseBusy={firebaseBusy}
        firebaseError={firebaseError}
         onFirebaseSignIn={(provider) => { void handleFirebaseSignIn(provider); }}
         onFirebaseSignOut={() => { void handleFirebaseSignOut(); }}
         onFirebaseSync={() => { void handleFirebaseSync(); }}
         onFirebaseDeleteAccount={handleRequestDeleteFirebaseAccount}
       />}
       {profileOnboardingOpen && <ProfileOnboardingModal configured={firebaseConfigured} user={firebaseUser} busy={firebaseBusy} firebaseError={firebaseError} onGoogleSignIn={() => { void handleFirebaseSignIn("google"); }} onComplete={handleCompleteProfileOnboarding} />}
      {syncOpen && <SyncModal endpoint={syncEndpoint} room={syncRoom} error={syncError} autoSync={autoSync} syncStatus={syncStatus} isOnline={isOnline} testingConnection={testingConnection} conflict={syncConflict} onEndpointChange={(value) => { setSyncEndpoint(value); setSyncError(null); }} onRoomChange={(value) => { setSyncRoom(value); setSyncError(null); }} onAutoSyncChange={setAutoSync} onTestConnection={handleTestConnection} onCopyRoom={handleCopyRoom} onResolveConflict={handleResolveSyncConflict} onClose={() => setSyncOpen(false)} onSave={handleSaveSyncSettings} />}
      {resetProgressOpen && <ResetProgressModal onClose={() => setResetProgressOpen(false)} onConfirm={handleResetProgress} />}
      {bulkDeleteIds && <BulkDeleteModal count={bulkDeleteIds.length} onClose={() => setBulkDeleteIds(null)} onConfirm={handleConfirmBulkDelete} />}
      {deleteAccountOpen && firebaseUser && <DeleteAccountModal email={firebaseUser.email ?? ""} busy={firebaseBusy} error={firebaseError} onClose={() => { if (!firebaseBusy) { setDeleteAccountOpen(false); setFirebaseError(null); } }} onConfirm={() => { void handleDeleteFirebaseAccount(); }} />}
      {firebaseMergePrompt && firebaseUser && <FirebaseMergeModal localCardCount={state.cards.length} remoteCardCount={firebaseMergePrompt.remoteState.cards.length} remoteProfileName={firebaseMergePrompt.remoteProfileName} busy={firebaseBusy} onClose={handleDeferFirebaseMerge} onResolve={handleFirebaseMergeChoice} />}
      {showInstallPrompt && <InstallPrompt canInstall={installPrompt.canInstall} isIos={installPrompt.isIos} isMobile={installPrompt.isMobile} onInstall={() => { void handleInstallApp(); }} onDismiss={handleDismissInstallPrompt} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={16} aria-hidden="true" /><span>{toast.message}</span>{toast.action && <button type="button" className="toast__action" onClick={() => { const action = toast.action; setToast(null); action?.onClick(); }}>{toast.action.label}</button>}</div>}
    </div>
  );
}
