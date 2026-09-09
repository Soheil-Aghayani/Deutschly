import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from "react";
import Avatar from "boring-avatars";
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
  CalendarDays,
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
  Pencil,
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
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { getDailyAvatar } from "./lib/avatar";
import { reviewCardWithGemini } from "./lib/gemini";
import type { GeminiCardReview, GeminiCardReviewInput } from "./lib/gemini";
import { playPracticeFeedbackSound } from "./lib/feedbackSounds";
import { GERMAN_WORD_DATABASE, searchGermanWords } from "./data/germanWords";
import type { GermanWordRecord } from "./data/germanWords";
import { assessPdfCandidate, extractMenschenPdf, getMenschenLesson, normalizePdfCandidateStatuses } from "./lib/pdfImport";
import type { PdfCandidate, PdfCandidateStatus } from "./lib/pdfImport";
import { checkSyncHealth, createSyncRoom, normalizeSyncRoom, pullSync, pushSync } from "./lib/sync";
import {
  answerMatches,
  getCardMastery,
  getLevelProgress,
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
type PracticeMode = "article" | "plural" | "translation" | "cloze";
type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";
type NotificationPermissionState = NotificationPermission | "unsupported";

interface Flashcard {
  id: string;
  german: string;
  translation: string;
  article: Article;
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
}

interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
}

const STORAGE_KEY = "deutschly:state:v1";
const SYNC_ENDPOINT_KEY = "deutschly:sync:endpoint:v1";
const SYNC_ROOM_KEY = "deutschly:sync:room:v1";
const AUTO_SYNC_KEY = "deutschly:sync:auto:v1";
const REMINDER_SNOOZE_KEY = "deutschly:reminder:snooze:v3";
const PWA_INSTALL_DISMISSED_KEY = "deutschly:pwa:install-dismissed:v1";
const PROFILE_NAME_KEY = "deutschly:profile:name:v1";
const PROFILE_NAME_MAX_LENGTH = 32;
const PROFILE_DISPLAY_FALLBACK = "Learner";
const LATIN_PROFILE_NAME_PATTERN = /^[\p{Script=Latin}]+(?:[\s.'’'-]+[\p{Script=Latin}]+)*$/u;
const PROFILE_AVATAR_COLORS = ["#EEF0FF", "#8D8BFF", "#56C39E", "#F6A261", "#F2B4BE"];

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

function normalizeAppState(value: unknown): AppState {
  const fallback = createInitialState();
  if (!isRecord(value)) return fallback;

  const normalizedCards = (Array.isArray(value.cards) ? value.cards.filter(isFlashcard) : fallback.cards).map(normalizeCard);
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

  return {
    ...fallback,
    cards,
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
    achievements: Array.isArray(value.achievements)
      ? value.achievements.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 40)).slice(0, 24)
      : fallback.achievements,
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
    if (!raw) return fallback;
    return normalizeAppState(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function loadLocalSetting(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
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

  return {
    ...local,
    cards: mergedCards,
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

function ArticleBadge({ article, compact = false }: { article: Article; compact?: boolean }) {
  const meta = articleMeta[article];
  if (article === "none") {
    return <span className={`article-badge article-badge--neutral${compact ? " article-badge--compact" : ""}`}>phrase</span>;
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

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`overflow-menu${className ? ` ${className}` : ""}`}>
      <button type="button" className="icon-button icon-button--small overflow-menu__trigger" onClick={() => setOpen((current) => !current)} aria-label={label} aria-expanded={open} aria-haspopup="menu" title={label}><MoreHorizontal size={17} aria-hidden="true" /></button>
      {open && <div className="overflow-menu__panel" role="menu" aria-label={label}>{items.map((item) => <button type="button" className="overflow-menu__item" role="menuitem" key={item.label} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}</div>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone, menuItems = [] }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${tone}`} aria-hidden="true">
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
        <article className="hero-card">
          <div className="hero-card__topline">
            <span className="hero-card__eyebrow"><Flame size={14} aria-hidden="true" /> Today's path</span>
            <span className="hero-card__goal"><Target size={14} aria-hidden="true" /> Daily goal</span>
          </div>
          <div className="hero-card__body">
            <div className="hero-card__copy">
              <span className="hero-card__streak"><Flame size={13} aria-hidden="true" /> {state.streak > 0 ? `${state.streak}-day streak` : "Ready for day one"}</span>
              <h2>{state.reviewsToday > 0 ? "Keep going!" : "Start your streak."}</h2>
              <p>{dueCards.length > 0 ? `${dueCards.length} cards are ready. One small session keeps your path moving.` : "Your next small win is ready when you are."}</p>
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
          <div className="hero-card__path" aria-label="Daily learning path">
            {[{ label: "Recall", complete: state.reviewsToday > 0 }, { label: "Practice", complete: progress >= 50 }, { label: "Goal", complete: progress >= 100 }].map((step, index) => (
              <span className={`hero-path__step${step.complete ? " hero-path__step--complete" : index === 0 ? " hero-path__step--current" : ""}`} key={step.label}>
                <span className="hero-path__dot">{step.complete ? <Check size={12} aria-hidden="true" /> : index + 1}</span>
                <span>{step.label}</span>
              </span>
            ))}
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
        <StatCard icon={Flame} label="Current streak" value={`${state.streak} days`} detail={`Best: ${state.bestStreak} days`} tone="orange" menuItems={[{ label: "View progress", onSelect: onViewProgress }]} />
        <StatCard icon={BookMarked} label="Mastered cards" value={String(state.mastered)} detail="+18 this month" tone="indigo" menuItems={[{ label: "Open library", onSelect: onOpenLibrary }]} />
        <StatCard icon={Timer} label="Study time" value={`${state.studyMinutes} min`} detail="Today · 24 min goal" tone="mint" menuItems={[{ label: "View progress", onSelect: onViewProgress }]} />
      </section>

      <section className="content-grid">
        <div className="main-column">
          <SectionHeading eyebrow="KEEP GOING" title="Continue learning" action={{ label: "Open study", onClick: onStartReview }} />
          <article className="continue-card">
            <div className="continue-card__content">
              <div className="continue-card__topline">
                <span className="deck-pill"><BookOpen size={14} aria-hidden="true" /> Menschen A1.1</span>
                <span className="muted-label">{dueCards.length} due now</span>
              </div>
              <h3>Vocabulary essentials</h3>
              <p>Lessons 1–6 · nouns, everyday phrases, and your first conversations.</p>
              <div className="mini-progress"><span style={{ width: `${courseProgress}%` }} /></div>
              <div className="continue-card__footer">
                <span>{courseProgress}% complete</span>
                <button type="button" className="inline-button" onClick={onStartReview}>Continue <ArrowRight size={15} aria-hidden="true" /></button>
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
                  <ArticleBadge article={card.article} compact />
                  <span className="due-row__word">{card.german}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button type="button" className="button button--outline button--full" onClick={onStartReview}>
              Start review
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </article>

          <article className="source-card">
            <div className="source-card__icon" aria-hidden="true"><FileText size={18} /></div>
            <div>
              <strong>Menschen PDF</strong>
              <span>{state.sourceFileName || "Attach your course PDF in Library"}</span>
            </div>
            <Info size={16} aria-hidden="true" />
          </article>
        </aside>
      </section>
    </div>
  );
}

function DeckCard({ icon: Icon, title, subtitle, progress, count, tone, onClick, onAddCard }: { icon: LucideIcon; title: string; subtitle: string; progress: number; count: string; tone: "indigo" | "mint"; onClick: () => void; onAddCard: () => void }) {
  return (
    <article className="deck-card">
      <button type="button" className="deck-card__main" onClick={onClick} aria-label={`Open ${title} in your library`}>
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
  reminderTime,
  sessionReviewed,
  sessionTotal,
  showAnswer,
  onShowAnswer,
  onRate,
  onBack,
  onAddCard,
}: {
  dueCards: Flashcard[];
  reminderTime: string;
  sessionReviewed: number;
  sessionTotal: number;
  showAnswer: boolean;
  onShowAnswer: () => void;
  onRate: (rating: ReviewRating) => void;
  onBack: () => void;
  onAddCard: () => void;
}) {
  const card = dueCards[0];

  if (!card) {
    return (
      <div className="page-stack study-page study-page--complete">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back to overview</button>
        <div className="complete-card">
          <div className="complete-card__icon" aria-hidden="true"><Sparkles size={28} /></div>
          <span className="page-kicker">Review session complete</span>
          <h1>Alles klar.</h1>
          <p>You are all caught up for now. Come back when the next review window opens.</p>
          <div className="complete-card__actions">
            <button type="button" className="button button--primary" onClick={onBack}>Back to overview <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="button button--outline" onClick={onAddCard}><Plus size={16} aria-hidden="true" /> Add a card</button>
          </div>
        </div>
      </div>
    );
  }

  const total = Math.max(sessionTotal, dueCards.length, 1);
  const currentPosition = Math.min(sessionReviewed + 1, total);
  const progress = Math.max(10, Math.round((sessionReviewed / total) * 100));
  const displayWord = `${card.article !== "none" ? `${card.article} ` : ""}${card.german}`;

  return (
    <div className="page-stack study-page">
      <div className="study-topbar">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back to overview</button>
        <div className="study-counter"><strong>{currentPosition}</strong><span>of {total} cards</span></div>
      </div>
      <div className="study-progress-bar" aria-label={`${progress}% of review session`}><span style={{ width: `${progress}%` }} /></div>

      <div className="study-layout">
        <div className="study-main">
          <article className={`study-card${showAnswer ? " study-card--answered" : ""}`}>
            <div className="study-card__meta">
              <div className="study-card__source"><BookOpen size={15} aria-hidden="true" /> {card.deck} <span>·</span> {card.lesson}{card.sourcePage && <span> · p. {card.sourcePage}</span>}</div>
              <ArticleBadge article={card.article} />
            </div>
            <div className="study-card__prompt">{showAnswer ? "Can you remember it?" : "What is the meaning of this word?"}</div>
            <div className="study-card__word" style={getStudyWordStyle(card)}>
              {card.article !== "none" && <span className={`article-word article-word--${card.article}`}>{card.article} </span>}
              {card.german}
            </div>
            {card.plural && <div className="study-card__plural"><span>Plural</span> <strong>{card.plural}</strong></div>}
            <div className="study-card__audio"><PronunciationButton text={displayWord} /><button type="button" className="button button--ghost" onClick={() => speakGerman(displayWord, 0.62)}><Volume2 size={14} aria-hidden="true" /> Slow pronunciation</button></div>
            <div className={`study-answer${showAnswer ? " study-answer--visible" : ""}`}>
              {showAnswer ? (
                <>
                  <div className="study-answer__translation">{card.translation}</div>
                  {card.example && <div className="study-answer__example"><span>Example</span><p>{card.example}</p><PronunciationButton text={card.example} /></div>}
                  {card.note && <div className="study-answer__note"><Info size={14} aria-hidden="true" /> {card.note}</div>}
                  <VoiceRecorder prompt={`Record yourself saying ${displayWord}`} />
                </>
              ) : (
                <div className="study-answer__hidden"><Eye size={18} aria-hidden="true" /> Answer hidden until you recall it</div>
              )}
            </div>
            {!showAnswer ? (
              <button type="button" className="button button--primary button--large" onClick={onShowAnswer}>
                Show answer
                <Eye size={18} aria-hidden="true" />
              </button>
            ) : (
              <div className="rating-panel">
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
          </article>
          <p className="study-hint"><KeyboardHint>Space</KeyboardHint> to reveal <span>·</span> <KeyboardHint>1–4</KeyboardHint> to rate</p>
        </div>

        <aside className="study-aside">
          <article className="how-card">
            <div className="side-card__heading"><div><span className="section-eyebrow">DYNAMIC REMEMBERING</span><h2>Why this works</h2></div><Brain size={19} aria-hidden="true" /></div>
            <div className="memory-steps">
              <MemoryStep number="01" title="Recall" detail="Try before revealing the answer." active />
              <MemoryStep number="02" title="Rate" detail="Tell us how it felt." />
              <MemoryStep number="03" title="Return" detail="We schedule the right interval." />
            </div>
          </article>
          <article className="next-window-card">
            <div className="next-window-card__icon" aria-hidden="true"><CalendarDays size={18} /></div>
            <div><span>Reminder window</span><strong>Daily at {formatTimeLabel(reminderTime)}</strong></div>
          </article>
        </aside>
      </div>
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

function VoiceRecorder({ prompt }: { prompt: string }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not available in this browser.");
      return;
    }
    try {
      setError(null);
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

  return (
    <div className="voice-recorder">
      <div><Mic size={14} aria-hidden="true" /><span>{prompt}</span></div>
      {recording ? <button type="button" className="button button--ghost voice-recorder__stop" onClick={stopRecording}><Square size={13} aria-hidden="true" /> Stop</button> : <button type="button" className="button button--ghost" onClick={() => void startRecording()}><Mic size={13} aria-hidden="true" /> Record</button>}
      {audioUrl && <audio controls src={audioUrl} aria-label="Your pronunciation recording" />}
      {error && <small role="status">{error}</small>}
    </div>
  );
}

function PracticePage({ cards, onAddCard }: { cards: Flashcard[]; onAddCard: () => void }) {
  const [mode, setMode] = useState<PracticeMode>("article");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const eligibleCards = useMemo(() => cards.filter((card) => mode !== "plural" || Boolean(card.plural)), [cards, mode]);
  const card = eligibleCards.length > 0 ? eligibleCards[index % eligibleCards.length] : undefined;

  useEffect(() => {
    setIndex(0);
    setAnswer("");
    setSubmitted(false);
    setScore(0);
    setAttempts(0);
  }, [mode]);

  useEffect(() => {
    if (submitted) nextButtonRef.current?.focus();
  }, [index, submitted]);

  if (!card) {
    return (
      <div className="page-stack practice-page">
        <section className="page-intro"><div><span className="page-kicker">PRACTICE LAB</span><h1>Practice<span className="title-dot">.</span></h1><p>Add a card with a plural first, then come back for focused practice.</p></div></section>
        <section className="empty-practice"><div className="empty-practice__icon"><ListChecks size={24} aria-hidden="true" /></div><h2>No plural cards yet</h2><p>Plural practice needs at least one card with a saved plural form.</p><button type="button" className="button button--primary" onClick={onAddCard}><Plus size={16} aria-hidden="true" /> Add a card</button></section>
      </div>
    );
  }

  const displayWord = `${card.article !== "none" ? `${card.article} ` : ""}${card.german}`;
  const prompt = mode === "article"
    ? `Which article belongs to “${card.german}”?`
    : mode === "plural"
      ? `What is the plural of “${displayWord}”?`
      : mode === "translation"
        ? `What does “${displayWord}” mean?`
        : "Complete the sentence from your memory.";
  const questionValue = mode === "article" ? card.german : mode === "cloze" ? makeClozeSentence(card.example, card.german) : displayWord;
  const expected = mode === "article" ? (card.article === "plural" ? "die" : card.article) : mode === "plural" ? card.plural ?? "" : mode === "translation" ? card.translation : card.german;
  const expectedLabel = mode === "article" ? (card.article === "plural" ? "die · plural" : `${card.article} · ${articleMeta[card.article].detail}`) : mode === "plural" ? card.plural ?? "No plural saved" : mode === "translation" ? card.translation : card.german;
  const expectedAudio = mode === "article" ? expected : expectedLabel;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted || !answer.trim()) return;
    const correct = answerMatches(answer, expected);
    const isFinalQuestion = index % eligibleCards.length === eligibleCards.length - 1;
    playPracticeFeedbackSound(isFinalQuestion ? "complete" : correct ? "correct" : "incorrect");
    setIsCorrect(correct);
    setSubmitted(true);
    setAttempts((current) => current + 1);
    if (correct) setScore((current) => current + 1);
  };

  const nextCard = () => {
    setIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(false);
  };

  return (
    <div className="page-stack practice-page">
      <section className="page-intro practice-page__intro">
        <div><span className="page-kicker">PRACTICE LAB</span><h1>Practice<span className="title-dot">.</span></h1><p>Short active-recall drills for the details that make German stick.</p></div>
        <div className="practice-score"><Trophy size={16} aria-hidden="true" /><strong>{score}/{attempts}</strong><span>correct</span></div>
      </section>

      <section className="practice-toolbar" aria-label="Practice settings">
        <div className="practice-toolbar__summary"><SlidersHorizontal size={17} aria-hidden="true" /><div className="practice-toolbar__copy"><strong>Choose a drill</strong><span>Change the question without losing your library.</span></div></div>
        <label className="practice-select"><span>Practice mode</span><select value={mode} onChange={(event) => setMode(event.target.value as PracticeMode)}><option value="article">Article</option><option value="plural">Plural</option><option value="translation">Translation</option><option value="cloze">Sentence gap</option></select><ChevronDown size={15} aria-hidden="true" /></label>
      </section>

      <section className="practice-layout">
        <article className={`practice-card${submitted ? isCorrect ? " practice-card--correct" : " practice-card--wrong" : ""}`}>
          <div className="practice-card__topline"><span>{mode === "article" ? "ARTICLE DRILL" : mode === "plural" ? "PLURAL DRILL" : mode === "translation" ? "MEANING DRILL" : "CLOZE DRILL"}</span><span>{(index % eligibleCards.length) + 1} / {eligibleCards.length}</span></div>
          <p className="practice-card__prompt">{prompt}</p>
          <div className={`practice-card__question${mode === "cloze" ? " practice-card__question--cloze" : ""}`}>{questionValue}</div>
          {mode !== "article" && <div className="practice-card__audio"><PronunciationButton text={displayWord} /><button type="button" className="button button--ghost" onClick={() => speakGerman(displayWord, 0.62)}><Volume2 size={14} aria-hidden="true" /> Slow pronunciation</button></div>}

          <form className="practice-answer" onSubmit={handleSubmit}>
            <label htmlFor="practice-answer">Your answer</label>
            <div className="practice-answer__row"><input id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={mode === "article" ? "der / die / das" : mode === "plural" ? "Type the plural" : "Type your answer"} autoComplete="off" disabled={submitted} /><button type="submit" className="button button--primary" disabled={submitted || !answer.trim()}>{submitted ? "Checked" : "Check"} <Check size={16} aria-hidden="true" /></button></div>
          </form>

          {submitted && <div className="practice-result" role="status"><div className="practice-result__icon" aria-hidden="true">{isCorrect ? <CheckCircle2 size={21} /> : <Info size={21} />}</div><div><strong>{isCorrect ? "Sehr gut!" : "Almost, keep this one visible."}</strong><span>{isCorrect ? "That answer matches the card." : `Expected: ${expectedLabel}`}</span></div>{!isCorrect && <PronunciationButton text={expectedAudio} />}</div>}
          {submitted && <button ref={nextButtonRef} type="button" className="button button--outline practice-next" onClick={nextCard}><ArrowRight size={15} aria-hidden="true" /> Next drill</button>}
        </article>

        <aside className="practice-aside"><div className="practice-aside__heading"><div className="practice-aside__icon"><Languages size={19} aria-hidden="true" /></div><span className="section-eyebrow">ACTIVE RECALL</span></div><h2>Small answer, strong memory.</h2><p>Typing the article, plural, or meaning makes the detail easier to retrieve later in a real conversation.</p><div className="practice-aside__tips"><div><strong>1</strong><span>Try before looking.</span></div><div><strong>2</strong><span>Say it out loud.</span></div><div><strong>3</strong><span>Move on gently.</span></div></div></aside>
      </section>
    </div>
  );
}

function KeyboardHint({ children }: { children: string }) {
  return <kbd>{children}</kbd>;
}

function MemoryStep({ number, title, detail, active = false }: { number: string; title: string; detail: string; active?: boolean }) {
  return (
    <div className={`memory-step${active ? " memory-step--active" : ""}`}>
      <span className="memory-step__number">{number}</span>
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
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
  const [visibleCount, setVisibleCount] = useState(12);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");

  const lessons = [...new Set(candidates.map((candidate) => candidate.lesson).filter((lesson): lesson is string => Boolean(lesson)))];
  const lowConfidenceCount = candidates.filter((candidate) => candidate.confidence === "low").length;
  const qualityCandidates = showLowConfidence ? candidates : candidates.filter((candidate) => candidate.confidence !== "low");
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
    setVisibleCount(12);
    setShowLowConfidence(false);
    setCandidateSearch("");
  }, [candidates]);

  useEffect(() => {
    setVisibleCount(12);
  }, [statusFilter, lessonFilter, showLowConfidence, candidateSearch]);

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
              {lowConfidenceCount > 0 && <label className="filter-check pdf-candidate-quality-toggle"><input type="checkbox" checked={showLowConfidence} onChange={(event) => setShowLowConfidence(event.target.checked)} /><span>{showLowConfidence ? "Showing" : "Show"} {lowConfidenceCount} low-confidence {lowConfidenceCount === 1 ? "fragment" : "fragments"}</span></label>}
              <span role="status" aria-live="polite">{filteredCandidates.length} {statusLabels[statusFilter].toLocaleLowerCase()} suggestions</span>
            </div>
          </div>
          <div className="pdf-candidate-list">
            {filteredCandidates.slice(0, visibleCount).map((candidate) => (
              <div className={`pdf-candidate-row pdf-candidate-row--${statusFilter}`} key={candidate.id}>
                <ArticleBadge article={candidate.article} compact />
                <div className="pdf-candidate-row__copy">
                  <div className="pdf-candidate-row__title"><strong>{candidate.german}</strong>{candidate.confidence && candidate.confidence !== "high" && <span className={`pdf-candidate-quality-badge pdf-candidate-quality-badge--${candidate.confidence}`}>{candidate.confidence === "low" ? "Low confidence" : "Needs a closer look"}</span>}{statusFilter !== "pending" && <span className={`pdf-candidate-status pdf-candidate-status--${statusFilter}`}>{statusLabels[statusFilter]}</span>}</div>
                  <span>{candidate.lesson || "Menschen A1.1"} · Suggested word</span>
                  {candidate.confidence && candidate.confidence !== "high" && candidate.confidenceReasons && candidate.confidenceReasons.length > 0 && <span className="pdf-candidate-reason">OCR note: {candidate.confidenceReasons.join(" · ")}</span>}
                </div>
                <div className="pdf-candidate-row__actions">
                  {statusFilter === "pending" ? <>
                    <button type="button" className="button button--outline" onClick={() => onUseCandidate(candidate)}>Use word <ArrowRight size={14} aria-hidden="true" /></button>
                    <button type="button" className="button button--ghost pdf-candidate-skip" onClick={() => onCandidateStatusChange(candidate.id, "skipped")} aria-label={`Skip ${candidate.german}`}>Skip</button>
                  </> : <button type="button" className="button button--ghost" onClick={() => onCandidateStatusChange(candidate.id, "pending")}><RefreshCw size={14} aria-hidden="true" /> Move to inbox</button>}
                </div>
              </div>
            ))}
          </div>
          {filteredCandidates.length === 0 && <div className="pdf-import-card__empty"><Info size={17} aria-hidden="true" /><span>{normalizedCandidateSearch ? "No suggestions match that search." : !showLowConfidence && lowConfidenceCount > 0 && qualityCandidates.length === 0 ? "Only low-confidence OCR fragments are hidden. Turn on the option above to review them." : lessonFilter === "all" ? emptyMessages[statusFilter] : "No suggestions were found for this lesson and status."}</span></div>}
          {filteredCandidates.length > visibleCount && <button type="button" className="button button--ghost pdf-candidate-more" onClick={() => setVisibleCount((count) => count + 12)}>Show 12 more</button>}
        </>
      )}

      {!loading && candidates.length > 0 && filteredCandidates.length > 0 && <span className="pdf-import-card__more">Showing {Math.min(visibleCount, filteredCandidates.length)} of {filteredCandidates.length} {statusLabels[statusFilter].toLocaleLowerCase()} suggestions. Use word opens the full duplicate and reference check.{!showLowConfidence && lowConfidenceCount > 0 ? ` ${lowConfidenceCount} low-confidence ${lowConfidenceCount === 1 ? "fragment is" : "fragments are"} hidden until you include them.` : ""}</span>}
      {!loading && candidates.length === 0 && !error && <div className="pdf-import-card__empty"><Sparkles size={17} aria-hidden="true" /><span>No article + noun patterns were detected. You can still add cards manually.</span></div>}

      {sourcePreview && (
        <div className={`pdf-preview-details${previewOpen ? " pdf-preview-details--open" : ""}`}>
          <button type="button" className="pdf-preview-details__summary" aria-expanded={previewOpen} aria-controls="pdf-text-preview" onClick={() => setPreviewOpen((current) => !current)}>
            <span>Preview extracted text</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <div id="pdf-text-preview" className="pdf-preview-details__content" aria-hidden={!previewOpen}><pre>{sourcePreview}</pre></div>
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
      <div id="resource-shelf-links" className={`resource-shelf__content${open ? " resource-shelf__content--open" : ""}`} aria-hidden={!open}>
        <div className="resource-shelf__links">{germanResourceLinks.map((resource) => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer">{resource.label}<ExternalLink size={12} aria-hidden="true" /></a>)}</div>
      </div>
    </section>
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
  onEditCard,
  weakCardsOnly,
  onWeakCardsOnlyChange,
  onPdfUpload,
  onUsePdfCandidate,
  onPdfCandidateStatusChange,
  onExportBackup,
  onImportBackup,
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
  onAddDatabaseWord: (word: GermanWordRecord) => void;
  onEditCard: (card: Flashcard) => void;
  weakCardsOnly: boolean;
  onWeakCardsOnlyChange: (value: boolean) => void;
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUsePdfCandidate: (candidate: PdfCandidate) => void;
  onPdfCandidateStatusChange: (candidateId: string, status: PdfCandidateStatus) => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [lessonFilter, setLessonFilter] = useState("all");
  const [articleFilter, setArticleFilter] = useState<"all" | Article>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CardStatus>("all");
  const [wordBankQuery, setWordBankQuery] = useState("");
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const lessons = [...new Set(cards.map((card) => card.lesson).filter(Boolean))].sort();
  const tags = [...new Set(cards.flatMap((card) => card.tags ?? []))].sort();
  const wordBankSuggestions = useMemo(() => searchGermanWords(wordBankQuery, 6), [wordBankQuery]);
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

      <section className="word-bank-card" aria-labelledby="word-bank-title">
        <div className="word-bank-card__header">
          <div className="word-bank-card__heading">
            <span className="word-bank-card__icon" aria-hidden="true"><Languages size={19} /></span>
            <div>
              <span className="section-eyebrow">GEMINI WORD BANK</span>
              <h2 id="word-bank-title">Find a word to add</h2>
              <p>Search the checked A1 and A2 records, then review the details before saving a card.</p>
            </div>
          </div>
          <span className="word-bank-card__count">{GERMAN_WORD_DATABASE.length} records</span>
        </div>
        <label className="word-bank-search" htmlFor="word-bank-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search the German word bank</span>
          <input id="word-bank-search" type="search" value={wordBankQuery} onChange={(event) => setWordBankQuery(event.target.value)} placeholder="Search a German word..." />
        </label>
        {wordBankQuery.trim() && (
          wordBankSuggestions.length > 0 ? (
            <div className="word-bank-suggestions" role="listbox" aria-label="German word bank suggestions">
              {wordBankSuggestions.map((word) => (
                <button type="button" className="word-bank-suggestion" role="option" aria-label={`Add ${word.german}`} key={word.id} onClick={() => { onAddDatabaseWord(word); setWordBankQuery(""); }}>
                  <ArticleBadge article={word.article} compact />
                  <span className="word-bank-suggestion__copy"><strong>{word.german}</strong><small>{word.englishMeanings.join(" / ")}</small>{word.plural && <small>Plural: {word.plural}</small>}{word.source && <small className="word-bank-suggestion__source">{word.source.lesson} · p. {word.source.page}</small>}</span>
                  <span className="word-bank-suggestion__meta"><span>{word.level}</span><Plus size={15} aria-hidden="true" /></span>
                </button>
              ))}
            </div>
          ) : <div className="word-bank-empty"><Search size={16} aria-hidden="true" /><span>No matching word yet. Add it manually and use Check card.</span></div>
        )}
      </section>

      <section className="library-filters" aria-label="Filter cards">
        <div className="library-filters__label"><Filter size={16} aria-hidden="true" /><strong>Filter cards</strong><span>{filteredCards.length} of {cards.length}</span></div>
        <label className="library-filter"><span>Lesson</span><select value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)}><option value="all">All lessons</option>{lessons.map((lesson) => <option key={lesson} value={lesson}>{lesson}</option>)}</select></label>
        <label className="library-filter"><span>Article</span><select value={articleFilter} onChange={(event) => setArticleFilter(event.target.value as "all" | Article)}><option value="all">All articles</option><option value="der">der</option><option value="die">die</option><option value="das">das</option><option value="plural">die · plural</option><option value="none">Phrase</option></select></label>
        <label className="library-filter"><span>State</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | CardStatus)}><option value="all">All states</option><option value="new">New</option><option value="learning">Learning</option><option value="review">Review</option></select></label>
        {tags.length > 0 && <span className="library-filters__tags" aria-label={`${tags.length} tags available`}>{tags.slice(0, 3).map((tag) => <button type="button" key={tag} className={`filter-chip${searchQuery.toLowerCase() === tag.toLowerCase() ? " filter-chip--active" : ""}`} onClick={() => onSearch(tag)}><Tag size={12} aria-hidden="true" />{tag}</button>)}{tags.length > 3 && <span className="filter-chip__more">+{tags.length - 3}</span>}</span>}
        <label className="filter-check"><input type="checkbox" checked={needsCheckOnly} onChange={(event) => setNeedsCheckOnly(event.target.checked)} /><span>Needs check</span></label>
        <label className="filter-check"><input type="checkbox" checked={weakCardsOnly} onChange={(event) => onWeakCardsOnlyChange(event.target.checked)} /><span>Weak cards</span></label>
        {hasFilters && <button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}
      </section>

      <section className="library-source-card">
        <div className="library-source-card__icon" aria-hidden="true"><FileText size={22} /></div>
        <div className="library-source-card__copy"><span className="section-eyebrow">COURSE SOURCE</span><h2>Menschen A1.1</h2><p>{sourceFileName ? `${sourceFileName} attached · text extracted locally for lesson-based card creation` : "Attach your PDF to keep lesson references beside every card."}</p></div>
        <div className="library-source-card__stats"><div><strong>12</strong><span>lessons</span></div><div><strong>{sourcePageCount || "n/a"}</strong><span>PDF pages</span></div><div><strong>{sourceCandidateCount || "n/a"}</strong><span>suggestions</span></div></div>
      </section>

      {lessons.length > 0 && <section className="lesson-strip" aria-label="Menschen lessons">
        <div className="lesson-strip__heading"><BookText size={17} aria-hidden="true" /><div><span className="section-eyebrow">COURSE MAP</span><h2>Jump into a lesson</h2></div></div>
        <div className="lesson-strip__items">
          <button type="button" className={`lesson-chip${lessonFilter === "all" ? " lesson-chip--active" : ""}`} onClick={() => setLessonFilter("all")}><strong>All</strong><span>{cards.length} cards</span></button>
          {lessons.map((lesson) => <button type="button" className={`lesson-chip${lessonFilter === lesson ? " lesson-chip--active" : ""}`} key={lesson} onClick={() => setLessonFilter(lesson)}><strong>{lesson}</strong><span>{cards.filter((card) => card.lesson === lesson).length} cards</span></button>)}
        </div>
      </section>}

      <ResourceShelf />

      <PdfCandidatesCard candidates={pdfCandidates} sourcePreview={sourcePreview} loading={pdfLoading} error={pdfError} onUseCandidate={onUsePdfCandidate} candidateStatuses={pdfCandidateStatuses} onCandidateStatusChange={onPdfCandidateStatusChange} />

      <section className="library-list-card">
        <div className="library-list-card__heading"><div><span className="section-eyebrow">ALL CARDS</span><h2>{filteredCards.length} cards</h2></div><span className="muted-label">Article colors are always labeled</span></div>
        <div className="library-table" role="table" aria-label="Flashcard library">
          <div className="library-table__header" role="row"><span>Word</span><span>Meaning</span><span>Lesson</span><span>State</span><span aria-hidden="true" /></div>
          {filteredCards.map((card) => (
            <div className="library-row" role="row" key={card.id}>
              <div className="library-row__word"><ArticleBadge article={card.article} compact /><strong>{card.german}</strong>{card.plural && <small>plural: {card.plural}</small>}{card.tags && card.tags.length > 0 && <small className="library-row__tags">{card.tags.join(" · ")}</small>}{card.verification === "unverified" && <small className="verification-note">needs reference check</small>}</div>
              <span className="library-row__translation">{card.translation}</span>
              <span className="library-row__lesson">{card.lesson}{card.sourcePage && <small>p. {card.sourcePage}</small>}</span>
              <span className={`status-pill status-pill--${card.status}`}>{card.status === "review" ? "Review" : card.status === "learning" ? "Learning" : "New"}</span>
              <button type="button" className="icon-button icon-button--small" onClick={() => onEditCard(card)} aria-label={`Edit ${card.german}`} title={`Edit ${card.german}`}><Pencil size={15} aria-hidden="true" /></button>
            </div>
          ))}
          {filteredCards.length === 0 && <div className="empty-library"><Search size={20} aria-hidden="true" /><strong>No cards found</strong><span>Try a different word or lesson.</span></div>}
        </div>
      </section>
    </div>
  );
}

function ResetProgressModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel reset-progress-modal" role="dialog" aria-modal="true" aria-labelledby="reset-progress-title">
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel delete-card-modal" role="dialog" aria-modal="true" aria-labelledby="delete-card-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">REMOVE FROM LIBRARY</span><h2 id="delete-card-title">Delete this card?</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close delete card dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">This removes the card and its review history from your library. You can add it again later, but this action cannot be undone here.</p>
        <div className="delete-card-summary"><ArticleBadge article={card.article} compact /><div className="delete-card-summary__copy"><strong>{card.german}</strong><span>{card.translation}</span></div></div>
        <div className="modal-panel__footer"><span><Info size={15} aria-hidden="true" /> Your other cards and course PDF stay saved.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--danger" onClick={onConfirm}><Trash2 size={15} aria-hidden="true" /> Delete card</button></div></div>
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
      <div id={id} className="progress-breakdown-card__body" aria-hidden={!open}>
        <div>{children}</div>
      </div>
    </article>
  );
}

function ProgressPage({ state, onViewWeakCards, onAdjustReminder, onResetProgress, onStartReview }: { state: AppState; onViewWeakCards: () => void; onAdjustReminder: () => void; onResetProgress: () => void; onStartReview: () => void }) {
  const todayKey = getDayKey();
  const maxValue = Math.max(...state.weeklyReviews, 1);
  const average = Math.round(state.weeklyReviews.reduce((sum, value) => sum + value, 0) / state.weeklyReviews.length);
  const level = getLevelProgress(state.xp);
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
  const achievementLabels: Record<string, { title: string; detail: string }> = {
    "first-review": { title: "First recall", detail: "Started your memory loop" },
    "week-streak": { title: "One gentle week", detail: "Kept a 7-day study streak" },
    "daily-goal": { title: "Daily goal", detail: "Completed a full review goal" },
    "xp-1500": { title: "Momentum maker", detail: "Reached 1,500 XP" },
  };
  return (
    <div className="page-stack progress-page">
      <section className="page-intro"><div><span className="page-kicker">KEEP THE MOMENTUM</span><h1>Your progress<span className="title-dot">.</span></h1><p>Consistency beats cramming. Here is the shape of your week.</p></div><div className="progress-page__actions"><div className="progress-summary"><span>Weekly average</span><strong>{average} reviews</strong></div><button type="button" className="button button--ghost progress-reset-button" onClick={onResetProgress}><RefreshCw size={15} aria-hidden="true" /> Start from zero</button></div></section>
      <section className="progress-level-grid">
        <article className="level-card"><div className="level-card__topline"><div className="level-card__icon"><Medal size={18} aria-hidden="true" /></div><span>LEARNER LEVEL</span><strong>Level {level.level}</strong></div><div className="level-card__score"><b>{state.xp}</b><span>XP earned</span></div><div className="level-progress" aria-label={`${level.percent}% to level ${level.level + 1}`}><span style={{ width: `${level.percent}%` }} /></div><div className="level-card__footer"><span>{level.current} / {level.needed} XP to next level</span><span>{level.percent}%</span></div></article>
        <article className="achievement-card"><div className="achievement-card__heading"><div><span className="section-eyebrow">SMALL WINS</span><h2>Achievements</h2></div><Trophy size={19} aria-hidden="true" /></div><div className="achievement-list">{state.achievements.map((achievement) => { const item = achievementLabels[achievement] ?? { title: "New milestone", detail: achievement }; return <div className="achievement-item" key={achievement}><span className="achievement-item__icon"><CheckCheck size={14} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>; })}</div></article>
      </section>
      <section className="progress-overview-grid">
        <article className="progress-chart-card">
          <div className="side-card__heading"><div><span className="section-eyebrow">LAST 7 DAYS</span><h2>Review activity</h2></div><BarChart3 size={19} aria-hidden="true" /></div>
          <div className="large-chart" aria-label="Review activity for the last seven days">
            {state.weeklyReviews.map((value, index) => (
              <div className={`large-chart__column${index === state.weeklyReviews.length - 1 ? " large-chart__column--today" : ""}`} key={`${value}-${index}`}><div className="large-chart__value">{value}</div><div className="large-chart__track"><span style={{ height: `${Math.max(8, Math.round((value / maxValue) * 100))}%` }} /></div><span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span></div>
            ))}
          </div>
        </article>
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
          <p className="progress-breakdown-card__intro">Your recall balance across der, die, das, plural, and phrases.</p>
          <div className="progress-breakdown-list">
            {articleStats.length > 0 ? articleStats.map(({ article, stats }) => (
              <div className="progress-breakdown-row" key={article}>
                <div className="progress-breakdown-row__label"><div className="progress-breakdown-row__title"><ArticleBadge article={article} compact /><strong>{article === "plural" ? "Plural" : article === "none" ? "Phrases" : article}</strong></div><span>{stats.total} cards · {stats.inReview} in review · {stats.due} due</span></div>
                <div className="progress-breakdown-row__value"><strong>{stats.mastery}%</strong><span>mastery</span></div>
                <div className="progress-breakdown-row__bar" role="progressbar" aria-label={`${article === "none" ? "Phrases" : article} mastery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.mastery}><span style={{ width: `${stats.mastery}%` }} /></div>
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
          <div><Sparkles size={16} aria-hidden="true" /><span><strong>Optional Gemini review</strong><small>Check tricky articles, plurals, meanings, and duplicate clues.</small></span></div>
          <button type="button" className="button button--ghost" onClick={onAiCheck} disabled={aiChecking}>{aiChecking ? <RefreshCw size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{aiChecking ? "Checking..." : "Ask Gemini"}</button>
        </div>
        <small className="card-check__ai-note">The local checker stays the source of truth. Gemini suggestions are never saved automatically.</small>
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

function ProfileOnboardingModal({ onSave }: { onSave: (name: string) => void }) {
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeProfileName(draftName);
    if (!isValidProfileName(normalized)) {
      setError("Use Latin letters only, for example Anna or Jean-Luc.");
      return;
    }
    onSave(normalized);
  };

  return (
    <div className="modal-backdrop modal-backdrop--onboarding" role="presentation">
      <section className="modal-panel onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-intro">
        <div className="onboarding-modal__icon" aria-hidden="true"><Sparkles size={21} /></div>
        <span className="section-eyebrow">WELCOME TO DEUTSCHLY</span>
        <h2 id="onboarding-title">Make this learning space yours.</h2>
        <p id="onboarding-intro" className="onboarding-modal__intro">Before we begin, tell us what to call you. Your name stays private on this device.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label className="form-field" htmlFor="onboarding-name"><span>Your name</span><input id="onboarding-name" value={draftName} onChange={(event) => { setDraftName(event.target.value.slice(0, PROFILE_NAME_MAX_LENGTH)); setError(""); }} placeholder="e.g. Anna" maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="name" spellCheck={false} inputMode="text" aria-invalid={Boolean(error)} aria-describedby={error ? "onboarding-name-error" : "onboarding-name-help"} /></label>
          <small id="onboarding-name-help" className="onboarding-modal__helper">Latin letters are required so your profile works consistently across devices.</small>
          {error && <div id="onboarding-name-error" className="onboarding-modal__error" role="alert"><Info size={15} aria-hidden="true" /> {error}</div>}
          <button type="submit" className="button button--primary onboarding-modal__submit"><span>Continue</span><ArrowRight size={16} aria-hidden="true" /></button>
        </form>
      </section>
    </div>
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
}: ProfileModalProps) {
  const [draftName, setDraftName] = useState(name);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const previewAvatar = getDailyAvatar(draftName.trim() || PROFILE_DISPLAY_FALLBACK, getDayKey());
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel profile-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">YOUR LEARNING SPACE</span><h2 id="settings-title">Settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Keep your profile, study rhythm, appearance, and local data in one calm place.</p>

        <div className="settings-sections">
          <section className="settings-section" aria-labelledby="settings-profile-title">
            <div className="settings-section__heading"><span className="settings-section__icon settings-section__icon--primary" aria-hidden="true"><Settings size={16} /></span><div><h3 id="settings-profile-title">Profile</h3><p>Personal details used across your learning space.</p></div></div>
            <div className="profile-preview"><div className="profile-preview__avatar"><Avatar name={previewAvatar.seed} variant={previewAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={58} title={false} aria-hidden="true" /></div><div><span className="section-eyebrow">LEARNER</span><strong>{draftName.trim() || "Your name"}</strong><small>Private on this device</small></div></div>
            <label className="form-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" value={draftName} onChange={(event) => setDraftName(event.target.value.slice(0, PROFILE_NAME_MAX_LENGTH))} placeholder="e.g. Anna" maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="name" spellCheck={false} /></label>
          </section>

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
  onEndpointChange,
  onRoomChange,
  onAutoSyncChange,
  onTestConnection,
  onCopyRoom,
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
  onEndpointChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onAutoSyncChange: (value: boolean) => void;
  onTestConnection: () => void;
  onCopyRoom: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <div className="modal-panel__heading">
          <div><span className="section-eyebrow">PRIVATE DEVICE SYNC</span><h2 id="sync-title">Connect your devices</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close sync settings" title="Close"><X size={19} aria-hidden="true" /></button>
        </div>
        <p className="modal-panel__intro">Run the Deutschly sync server on your PC, then use the same room code on your phone. Your cards stay in this private room instead of going to a third-party service. If the server starts with <code>GEMINI_API_FILE</code>, it also powers the optional Gemini card review without putting the key in your browser.</p>
        <div className="sync-modal__steps" aria-label="Sync setup steps">
          <div><strong>1</strong><span>On the PC, run <code>npm run sync-server -- --host 0.0.0.0</code> so the phone can reach it.</span></div>
          <div><strong>2</strong><span>Open the app on both devices over the same Wi-Fi network.</span></div>
          <div><strong>3</strong><span>Save the same room on both devices. Auto-sync can keep them up to date.</span></div>
        </div>
        <div className="form-grid">
          <label className="form-field" htmlFor="sync-endpoint"><span>Sync server URL</span><input id="sync-endpoint" value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} placeholder="/api/sync or http://192.168.1.20:8787/api/sync" /></label>
          <label className="form-field" htmlFor="sync-room"><span>Room code</span><input id="sync-room" value={room} onChange={(event) => onRoomChange(normalizeSyncRoom(event.target.value))} placeholder="8 characters" maxLength={32} autoCapitalize="characters" spellCheck={false} /></label>
        </div>
        <label className="sync-auto-option"><input type="checkbox" checked={autoSync} onChange={(event) => onAutoSyncChange(event.target.checked)} /><span><strong>Keep sync on automatically</strong><small>Push local changes after a short pause and look for updates from the other device every minute.</small></span></label>
        <div className={`sync-status sync-status--${isOnline ? syncStatus : "offline"}`} role="status"><Wifi size={15} aria-hidden="true" /><span>{!isOnline ? "Offline. Local changes are safe." : syncStatus === "syncing" ? "Syncing now..." : syncStatus === "synced" ? "Connection is ready." : syncStatus === "offline" ? "Not connected yet." : syncStatus === "error" ? "Connection needs attention." : "Connection not tested yet."}</span><button type="button" className="text-button" onClick={onTestConnection} disabled={testingConnection || !endpoint.trim() || !isOnline}>{testingConnection ? "Testing..." : "Test connection"}</button></div>
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
  const wordSuggestions = useMemo(() => {
    if (editing || draft.kind !== "word" || normalizeGermanTerm(draft.german).length < 2) return [];
    return searchGermanWords(draft.german, 5);
  }, [draft.german, draft.kind, editing]);
  const liveMatch = useMemo(() => {
    if (!draft.german.trim()) return null;
    return findCardMatch(existingCards, prepareCardDraft(draft));
  }, [draft, existingCards]);

  useEffect(() => {
    germanInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
      setAiError(error instanceof Error ? error.message : "Gemini could not review this card.");
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
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-card-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">PERSONAL LIBRARY</span><h2 id="add-card-title">{editing ? "Edit a flashcard" : "Add a flashcard"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close add card dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Add a word, phrase, or grammar item. Deutschly checks your entry for duplicates and common issues before it joins the review queue.</p>
        {liveMatch && <div className={`card-live-match card-live-match--${liveMatch.type}`} role="status"><Info size={15} aria-hidden="true" /><span><strong>{liveMatch.type === "exact" ? "This card is already saved." : "A card with this headword already exists."}</strong><small>{liveMatch.card.german} · {liveMatch.card.translation}. Press Check card to compare the meaning.</small></span></div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid form-grid--two">
            <div className="form-field-with-suggestions">
              <label className="form-field" htmlFor="card-german"><span>German *</span><input id="card-german" ref={germanInputRef} value={draft.german} onChange={(event) => update("german", event.target.value)} placeholder="e.g. gemütlich or Das Eis" required aria-autocomplete="list" aria-controls={wordSuggestions.length > 0 ? "card-word-suggestions" : undefined} aria-expanded={wordSuggestions.length > 0} /></label>
              {wordSuggestions.length > 0 && <div id="card-word-suggestions" className="word-suggestion-list" role="listbox" aria-label="German word bank suggestions">
                {wordSuggestions.map((word) => <button type="button" className="word-suggestion" role="option" aria-label={`Use ${word.german}`} key={word.id} onClick={() => applyWordSuggestion(word)}><ArticleBadge article={word.article} compact /><span className="word-suggestion__copy"><strong>{word.german}</strong><small>{word.englishMeanings.join(" / ")}</small>{word.plural && <small>Plural: {word.plural}</small>}{word.source && <small className="word-suggestion__source">{word.source.lesson} · p. {word.source.page}</small>}</span><span className="word-suggestion__meta"><span>{word.level}</span><Check size={14} aria-hidden="true" /></span></button>)}
              </div>}
            </div>
            <label className="form-field" htmlFor="card-translation"><span>Translation *</span><input id="card-translation" value={draft.translation} onChange={(event) => update("translation", event.target.value)} placeholder="e.g. cozy or ice cream" required /></label>
          </div>
          <div className="form-grid form-grid--three">
            <label className="form-field" htmlFor="card-article"><span>Article</span><select id="card-article" value={draft.article} onChange={(event) => update("article", event.target.value as Article)}><option value="der">der · masculine</option><option value="die">die · feminine</option><option value="das">das · neuter</option><option value="plural">die · plural</option><option value="none">No article</option></select></label>
            <label className="form-field" htmlFor="card-plural"><span>Plural</span><input id="card-plural" value={draft.plural} onChange={(event) => update("plural", event.target.value)} placeholder="e.g. Bücher" /></label>
            <label className="form-field" htmlFor="card-kind"><span>Item type</span><select id="card-kind" value={draft.kind} onChange={(event) => update("kind", event.target.value as CardKind)}><option value="word">Vocabulary</option><option value="phrase">Phrase</option><option value="grammar">Grammar</option></select></label>
          </div>
          <label className="form-field" htmlFor="card-example"><span>Example sentence</span><textarea id="card-example" value={draft.example} onChange={(event) => update("example", event.target.value)} placeholder="Write a sentence you can imagine using..." rows={2} /></label>
          <label className="form-field" htmlFor="card-note"><span>Personal note</span><textarea id="card-note" value={draft.note} onChange={(event) => update("note", event.target.value)} placeholder="A memory hint, related word, or pronunciation note" rows={2} /></label>
          <div className="form-grid form-grid--three">
            <label className="form-field" htmlFor="card-tags"><span>Tags</span><input id="card-tags" value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. lesson-1, difficult, travel" /></label>
            <label className="form-field" htmlFor="card-lesson"><span>Lesson or collection</span><input id="card-lesson" value={draft.lesson} onChange={(event) => update("lesson", event.target.value)} placeholder="e.g. Lesson 1" /></label>
            <label className="form-field" htmlFor="card-source-page"><span>PDF page <small>(optional)</small></span><input id="card-source-page" type="number" min="1" value={draft.sourcePage ?? ""} onChange={(event) => update("sourcePage", event.target.value ? Number(event.target.value) : undefined)} placeholder="e.g. 14" /></label>
          </div>
          {checkResult && <CardCheckPanel result={checkResult} referenceChecked={referenceChecked} onReferenceChecked={setReferenceChecked} onApplySuggestion={applySuggestion} aiReview={aiReview} aiError={aiError} aiChecking={aiChecking} onAiCheck={() => void handleAiCheck()} onApplyAiReview={applyAiReview} />}
          <div className="modal-panel__footer">
            <span><Info size={15} aria-hidden="true" /> {checkResult ? "Confirm the details after checking the references." : "A quick check helps keep your library clean."}</span>
            <div>
              {editing && !checkResult && onDelete && <button type="button" className="button button--ghost delete-card-button" onClick={onDelete}><Trash2 size={15} aria-hidden="true" /> Delete card</button>}
              {checkResult && <button type="button" className="button button--ghost" onClick={() => setCheckResult(null)}>Edit card</button>}
              <button type="button" className="button button--ghost" onClick={onClose}>Cancel</button>
              {!checkResult && <button type="submit" className="button button--primary"><CheckCircle2 size={16} aria-hidden="true" /> Check card</button>}
              {checkResult && <button type="button" className="button button--primary" onClick={handleConfirm} disabled={checkResult.match?.type === "exact" || !referenceChecked}>{checkResult.match?.type === "exact" ? "Already added" : !referenceChecked ? "Check references first" : checkResult.match?.type === "possible" ? "Add as separate meaning" : "Add checked card"}</button>}
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
  const [installDismissed, setInstallDismissed] = useState(() => loadLocalBooleanSetting(PWA_INSTALL_DISMISSED_KEY));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());
  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab());
  const [studySession, setStudySession] = useState({ reviewed: 0, total: 0 });
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
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [pdfCandidates, setPdfCandidates] = useState<PdfCandidate[]>(() => state.pdfImport?.candidates ?? []);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [addCardSeed, setAddCardSeed] = useState<Partial<CardDraft> | undefined>(undefined);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState(() => loadProfileName());
  const [profileOnboardingOpen, setProfileOnboardingOpen] = useState(() => !loadProfileName());
  const [profileOpen, setProfileOpen] = useState(false);
  const [resetProgressOpen, setResetProgressOpen] = useState(false);
  const [reminderSnoozedUntil, setReminderSnoozedUntil] = useState<number | null>(() => {
    const value = loadLocalNumberSetting(REMINDER_SNOOZE_KEY);
    return value && value > Date.now() ? value : null;
  });
  const [weakCardsOnly, setWeakCardsOnly] = useState(false);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const stateRef = useRef(state);
  const syncInFlightRef = useRef(false);
  const autoSyncReadyRef = useRef(false);
  const lastAutoSyncFingerprintRef = useRef("");

  const todayKey = getDayKey();
  stateRef.current = state;
  const cardPendingDeletion = deleteCardId ? state.cards.find((card) => card.id === deleteCardId) : undefined;
  const profileDisplayName = profileName || PROFILE_DISPLAY_FALLBACK;
  const profileAvatar = getDailyAvatar(profileDisplayName, todayKey);
  const dueCards = useMemo(() => state.cards
    .filter((card) => card.due <= todayKey)
    .sort((first, second) => {
      const dueOrder = first.due.localeCompare(second.due);
      if (dueOrder !== 0) return dueOrder;
      const difficultyOrder = (second.difficulty ?? 5) - (first.difficulty ?? 5);
      if (difficultyOrder !== 0) return difficultyOrder;
      return timestamp(first.lastReviewedAt) - timestamp(second.lastReviewedAt);
    }), [state.cards, todayKey]);
  const syncConfigured = Boolean(syncEndpoint.trim() && syncRoom.length >= 6);
  const syncFingerprint = useMemo(() => getSyncFingerprint(state), [state]);
  const showInstallPrompt = !installDismissed && !installPrompt.isInstalled && (installPrompt.canInstall || installPrompt.isIos || installPrompt.isMobile);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const modalOpen = addCardOpen || profileOpen || profileOnboardingOpen || syncOpen || resetProgressOpen || Boolean(deleteCardId);
    document.documentElement.classList.toggle("modal-open", modalOpen);
    document.body.classList.toggle("modal-open", modalOpen);
    return () => {
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    };
  }, [addCardOpen, profileOpen, profileOnboardingOpen, syncOpen, resetProgressOpen, deleteCardId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (addCardOpen || activeTab !== "study") return;
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
  }, [activeTab, addCardOpen, showAnswer, dueCards]);

  const showToast = (message: string) => {
    setToast(message);
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

  const handleOpenAddCard = (seed?: Partial<CardDraft>) => {
    setEditingCardId(null);
    setAddCardSeed(seed);
    setAddCardOpen(true);
  };

  const handleAddDatabaseWord = (word: GermanWordRecord) => {
    handleOpenAddCard(germanWordToCardDraft(word));
  };

  const handleOpenEditCard = (card: Flashcard) => {
    setEditingCardId(card.id);
    setAddCardSeed({
      german: card.german,
      translation: card.translation,
      article: card.article,
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
  };

  const handleRequestDeleteCard = () => {
    if (!editingCardId) return;
    setAddCardOpen(false);
    setAddCardSeed(undefined);
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
    showToast(`${deletedCard.german} was removed from your library.`);
  };

  const handleTabChange = (tab: Tab) => {
    if (tab === "study" && activeTab !== "study") setStudySession({ reviewed: 0, total: dueCards.length });
    setActiveTab(tab);
    if (tab !== "study") setShowAnswer(false);
  };

  const handleStartReview = () => {
    setStudySession({ reviewed: 0, total: dueCards.length });
    setActiveTab("study");
    setShowAnswer(false);
  };

  function handleRate(rating: ReviewRating) {
    const card = dueCards[0];
    if (!card) return;
    const schedule = scheduleReview(card, rating, todayKey);
    const reviewedAt = new Date().toISOString();
    const xpAward = getXpForRating(rating);
    const wasCorrect = rating !== "again";
    setState((current) => {
      const nextCards = current.cards.map((item) => item.id === card.id ? { ...item, ...schedule, lastReviewedAt: reviewedAt, updatedAt: reviewedAt } : item);
      const weeklyReviews = [...current.weeklyReviews];
      const lastIndex = weeklyReviews.length - 1;
      if (lastIndex >= 0) weeklyReviews[lastIndex] = (weeklyReviews[lastIndex] ?? 0) + 1;
      const reviewsToday = current.lastReviewDay === todayKey ? current.reviewsToday : 0;
      const becameMastered = rating === "easy" && card.status !== "review";
      const nextTotalReviews = current.totalReviews + 1;
      const nextXp = current.xp + xpAward;
      const nextStreak = current.lastStudyDay === todayKey
        ? current.streak
        : current.lastStudyDay === addDays(todayKey, -1) ? current.streak + 1 : 1;
      const achievements = new Set(current.achievements);
      if (nextTotalReviews >= 1) achievements.add("first-review");
      if (nextStreak >= 7) achievements.add("week-streak");
      if (reviewsToday + 1 >= current.dailyGoal) achievements.add("daily-goal");
      if (nextXp >= 1500) achievements.add("xp-1500");
      return {
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
        achievements: [...achievements],
        weeklyReviews,
        lastSyncedAt: reviewedAt,
      };
    });
    setStudySession((current) => ({ ...current, reviewed: Math.min(current.reviewed + 1, Math.max(current.total, 1)) }));
    setShowAnswer(false);
    showToast(`${rating === "again" ? "We’ll bring it back tomorrow" : `Next review in ${schedule.interval} days`} · +${xpAward} XP`);
  }

  const handleSaveCard = (draft: CardDraft) => {
    const preparedDraft = prepareCardDraft(draft);
    const duplicate = findCardMatch(state.cards.filter((card) => card.id !== editingCardId), preparedDraft);
    if (duplicate?.type === "exact") {
      showToast(`${duplicate.card.german} is already in your library`);
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
      return { ...current, cards: [newCard, ...current.cards], pdfImport, lastSyncedAt: createdAt };
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
    setSyncError(null);
    setSyncStatus("idle");
    setSyncOpen(false);
    showToast(autoSync ? "Sync connection saved. Auto-sync is on." : "Sync connection saved. Tap Sync now when both devices are ready.");
  };

  const handleSync = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (syncInFlightRef.current) return;
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
      const mergedState = remoteState ? mergeAppStates(localState, remoteState) : localState;
      const response = await pushSync(syncEndpoint, syncRoom, mergedState);
      const syncedAt = response.updatedAt || new Date().toISOString();
      lastAutoSyncFingerprintRef.current = getSyncFingerprint(mergedState);
      setState((current) => ({ ...mergeAppStates(current, mergedState), lastSyncedAt: syncedAt }));
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
    const payload = JSON.stringify({ app: "deutschly", version: 1, profile: profileDisplayName, exportedAt: new Date().toISOString(), state }, null, 2);
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
      const importedState = normalizeAppState(importedValue);
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
  const handleCompleteProfileOnboarding = (nextName: string) => {
    const trimmedName = normalizeProfileName(nextName);
    if (!isValidProfileName(trimmedName)) return;
    setProfileName(trimmedName);
    window.localStorage.setItem(PROFILE_NAME_KEY, trimmedName);
    setProfileOnboardingOpen(false);
    showToast(`Welcome to Deutschly, ${trimmedName}.`);
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
          <div className="sidebar__course"><span className="course-dot" aria-hidden="true" /><div><strong>Menschen A1.1</strong><span>German foundations</span></div><ChevronRight size={15} aria-hidden="true" /></div>
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
          <div className="sidebar-profile"><div className="avatar" role="img" aria-label={`${profileDisplayName} profile avatar`}><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={32} title={false} aria-hidden="true" /></div><div><strong>{profileDisplayName}</strong><span>Personal learner</span></div><button type="button" className="icon-button icon-button--small" onClick={() => setProfileOpen(true)} aria-label="Open profile settings" title="Profile settings"><Settings size={16} aria-hidden="true" /></button></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__context"><div className="mobile-brand"><span className="brand__mark" aria-hidden="true"><BookOpen size={18} /></span><span className="brand__word">deutschly</span></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{navItems.find((item) => item.id === activeTab)?.label}</strong></div></div>
          <div className="topbar__actions">
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={state.theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={state.theme === "light" ? "Dark mode" : "Light mode"}>{state.theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</button>
            <button type="button" className="icon-button notification-button" onClick={handleReminderBell} aria-label="View reminders" title="Reminders"><Bell size={18} aria-hidden="true" />{state.reminderEnabled && dueCards.length > 0 && <span aria-hidden="true" />}</button>
            <button type="button" className={`sync-button${syncing ? " sync-button--syncing" : ""}`} onClick={() => void handleSync()} disabled={syncing}><Cloud size={16} aria-hidden="true" />{syncing ? "Syncing..." : syncConfigured ? "Sync now" : "Set up sync"}</button>
            <button type="button" className="topbar__avatar" onClick={() => setProfileOpen(true)} aria-label={`Open profile settings for ${profileDisplayName}`} title="Profile settings"><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={34} title={false} aria-hidden="true" /></button>
          </div>
        </header>

        <main id="main-content" className="main-content">
          {activeTab === "overview" && <OverviewPage state={state} profileName={profileDisplayName} dueCards={dueCards} currentTime={currentTime} onStartReview={handleStartReview} onAddCard={() => handleOpenAddCard()} onOpenLibrary={() => handleTabChange("library")} onViewProgress={() => handleTabChange("progress")} onReminderToggle={handleReminderToggle} onReminderTimeChange={handleReminderTimeChange} onSnoozeReminder={handleSnoozeReminder} onAddReminderToCalendar={handleAddReminderToCalendar} notificationPermission={notificationPermission} onEnableNotifications={handleEnableNotifications} reminderSnoozedUntil={reminderSnoozedUntil} />}
          {activeTab === "study" && <StudyPage dueCards={dueCards} reminderTime={state.reminderTime} sessionReviewed={studySession.reviewed} sessionTotal={studySession.total} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={handleRate} onBack={() => handleTabChange("overview")} onAddCard={() => handleOpenAddCard()} />}
          {activeTab === "practice" && <PracticePage cards={state.cards} onAddCard={() => handleOpenAddCard()} />}
          {activeTab === "library" && <LibraryPage cards={state.cards} searchQuery={searchQuery} sourceFileName={state.sourceFileName} sourcePageCount={state.pdfImport?.pageCount ?? 0} sourceCandidateCount={state.pdfImport?.candidateCount ?? 0} sourcePreview={state.pdfImport?.textPreview ?? ""} pdfCandidates={pdfCandidates} pdfCandidateStatuses={state.pdfImport?.candidateStatuses ?? {}} pdfLoading={pdfLoading} pdfError={pdfError} onSearch={setSearchQuery} onAddCard={() => handleOpenAddCard()} onAddDatabaseWord={handleAddDatabaseWord} onEditCard={handleOpenEditCard} weakCardsOnly={weakCardsOnly} onWeakCardsOnlyChange={setWeakCardsOnly} onPdfUpload={handlePdfUpload} onUsePdfCandidate={handleUsePdfCandidate} onPdfCandidateStatusChange={handlePdfCandidateStatusChange} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} />}
          {activeTab === "progress" && <ProgressPage state={state} onViewWeakCards={handleViewWeakCards} onAdjustReminder={() => handleTabChange("overview")} onResetProgress={() => setResetProgressOpen(true)} onStartReview={handleStartReview} />}
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
      />}
      {profileOnboardingOpen && <ProfileOnboardingModal onSave={handleCompleteProfileOnboarding} />}
      {syncOpen && <SyncModal endpoint={syncEndpoint} room={syncRoom} error={syncError} autoSync={autoSync} syncStatus={syncStatus} isOnline={isOnline} testingConnection={testingConnection} onEndpointChange={(value) => { setSyncEndpoint(value); setSyncError(null); }} onRoomChange={(value) => { setSyncRoom(value); setSyncError(null); }} onAutoSyncChange={setAutoSync} onTestConnection={handleTestConnection} onCopyRoom={handleCopyRoom} onClose={() => setSyncOpen(false)} onSave={handleSaveSyncSettings} />}
      {resetProgressOpen && <ResetProgressModal onClose={() => setResetProgressOpen(false)} onConfirm={handleResetProgress} />}
      {showInstallPrompt && <InstallPrompt canInstall={installPrompt.canInstall} isIos={installPrompt.isIos} isMobile={installPrompt.isMobile} onInstall={() => { void handleInstallApp(); }} onDismiss={handleDismissInstallPrompt} />}
      {toast && <div className="toast" role="status"><Check size={16} aria-hidden="true" /> {toast}</div>}
    </div>
  );
}
