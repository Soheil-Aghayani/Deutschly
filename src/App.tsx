import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";
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
  Trophy,
  Upload,
  UploadCloud,
  Volume2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getDailyAvatar } from "./lib/avatar";
import { reviewCardWithGemini } from "./lib/gemini";
import type { GeminiCardReview, GeminiCardReviewInput } from "./lib/gemini";
import { extractMenschenPdf } from "./lib/pdfImport";
import type { PdfCandidate } from "./lib/pdfImport";
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
}

interface AppState {
  cards: Flashcard[];
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
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "indigo" | "orange" | "mint";
}

const STORAGE_KEY = "deutschly:state:v1";
const SYNC_ENDPOINT_KEY = "deutschly:sync:endpoint:v1";
const SYNC_ROOM_KEY = "deutschly:sync:room:v1";
const AUTO_SYNC_KEY = "deutschly:sync:auto:v1";
const REMINDER_SNOOZE_KEY = "deutschly:reminder:snooze:v1";
const PROFILE_NAME_KEY = "deutschly:profile:name:v1";
const PROFILE_NAME = "Fatemeh";
const PROFILE_AVATAR_COLORS = ["#EEF0FF", "#8D8BFF", "#56C39E", "#F6A261", "#F2B4BE"];

const navItems: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "study", label: "Study now", icon: Brain },
  { id: "practice", label: "Practice", icon: ListChecks },
  { id: "library", label: "My library", icon: Library },
  { id: "progress", label: "Progress", icon: BarChart3 },
];

const articleMeta: Record<Article, { label: string; detail: string }> = {
  der: { label: "der", detail: "masculine" },
  die: { label: "die", detail: "feminine" },
  das: { label: "das", detail: "neuter" },
  plural: { label: "die", detail: "plural" },
  none: { label: "—", detail: "no article" },
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

function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Guten Morgen";
  if (hour >= 12 && hour < 18) return "Guten Tag";
  if (hour >= 18 && hour < 22) return "Guten Abend";
  return "Gute Nacht";
}

function formatTimeLabel(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
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
      status: "learning",
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
      status: "learning",
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
    reviewsToday: 16,
    dailyGoal: 24,
    streak: 7,
    mastered: 248,
    studyMinutes: 18,
    xp: 1240,
    totalReviews: 482,
    correctReviews: 414,
    bestStreak: 14,
    achievements: ["first-review", "week-streak"],
    weeklyReviews: [18, 24, 14, 28, 21, 31, 16],
    reminderEnabled: true,
    reminderTime: "19:00",
    theme: "light",
    sourceFileName: "",
    lastReviewDay: getDayKey(),
    lastStudyDay: getDayKey(),
    lastSyncedAt: new Date().toISOString(),
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
    && typeof value.context === "string";
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

function normalizeAppState(value: unknown): AppState {
  const fallback = createInitialState();
  if (!isRecord(value)) return fallback;

  const cards = (Array.isArray(value.cards) ? value.cards.filter(isFlashcard) : fallback.cards).map(normalizeCard);
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
    ? {
      fileName: pdfImportValue.fileName,
      pageCount: pdfImportValue.pageCount,
      candidateCount: pdfImportValue.candidateCount,
      textPreview: pdfImportValue.textPreview,
      extractedAt: pdfImportValue.extractedAt,
      candidates: pdfImportValue.candidates.filter(isPdfCandidate),
    }
    : undefined;

  return {
    ...fallback,
    cards,
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

function mergeAppStates(local: AppState, remote: AppState): AppState {
  const latestReviewState = (local.lastReviewDay ?? "") >= (remote.lastReviewDay ?? "") ? local : remote;
  const weeklyReviews = Array.from({ length: 7 }, (_, index) => Math.max(local.weeklyReviews[index] ?? 0, remote.weeklyReviews[index] ?? 0));
  const localPdf = local.pdfImport;
  const remotePdf = remote.pdfImport;
  const pdfImport = localPdf && remotePdf
    ? timestamp(localPdf.extractedAt) >= timestamp(remotePdf.extractedAt) ? localPdf : remotePdf
    : localPdf ?? remotePdf;

  return {
    ...local,
    cards: mergeCards(local.cards, remote.cards),
    reviewsToday: local.lastReviewDay === remote.lastReviewDay ? Math.max(local.reviewsToday, remote.reviewsToday) : latestReviewState.reviewsToday,
    streak: Math.max(local.streak, remote.streak),
    mastered: Math.max(local.mastered, remote.mastered),
    studyMinutes: Math.max(local.studyMinutes, remote.studyMinutes),
    xp: Math.max(local.xp, remote.xp),
    totalReviews: Math.max(local.totalReviews, remote.totalReviews),
    correctReviews: Math.max(local.correctReviews, remote.correctReviews),
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    achievements: [...new Set([...local.achievements, ...remote.achievements])].slice(0, 24),
    weeklyReviews,
    sourceFileName: pdfImport?.fileName ?? local.sourceFileName,
    pdfImport,
    lastReviewDay: latestReviewState.lastReviewDay,
    lastStudyDay: (local.lastStudyDay ?? "") >= (remote.lastStudyDay ?? "") ? local.lastStudyDay : remote.lastStudyDay,
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

function prepareCardDraft(draft: CardDraft): CardDraft {
  const prepared = {
    ...draft,
    german: draft.german.trim(),
    translation: draft.translation.trim(),
    plural: draft.plural.trim(),
    example: draft.example.trim(),
    note: draft.note.trim(),
    tags: draft.tags.trim(),
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
      detail: `This headword and translation are not in ${PROFILE_NAME}’s library yet.`,
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

function StatCard({ icon: Icon, label, value, detail, tone }: StatCardProps) {
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
      <MoreHorizontal className="stat-card__more" size={18} aria-hidden="true" />
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
  onReminderToggle,
  onReminderTimeChange,
  onSnoozeReminder,
  onAddReminderToCalendar,
  reminderSnoozedUntil,
}: {
  state: AppState;
  profileName: string;
  dueCards: Flashcard[];
  currentTime: Date;
  onStartReview: () => void;
  onAddCard: () => void;
  onOpenLibrary: () => void;
  onReminderToggle: () => void;
  onReminderTimeChange: (value: string) => void;
  onSnoozeReminder: () => void;
  onAddReminderToCalendar: () => void;
  reminderSnoozedUntil: number | null;
}) {
  const progress = Math.min(100, Math.round((state.reviewsToday / state.dailyGoal) * 100));
  const dateLabel = formatDate(currentTime);
  const greeting = getGreeting(currentTime);
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
          <div className="hero-card__glow hero-card__glow--one" aria-hidden="true" />
          <div className="hero-card__glow hero-card__glow--two" aria-hidden="true" />
          <div className="hero-card__topline">
            <span className="hero-card__eyebrow">Your daily routine</span>
            <span className="hero-card__goal"><Target size={14} aria-hidden="true" /> Daily goal</span>
          </div>
          <div className="hero-card__body">
            <div className="hero-card__copy">
              <h2>Make it stick.</h2>
              <p>{dueCards.length} cards are ready for review. Keep your momentum gentle and consistent.</p>
              <button type="button" className="button button--light" onClick={onStartReview}>
                Review due cards
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="progress-ring" style={{ "--progress": `${progress}%` } as CSSProperties} aria-label={`${progress}% of daily goal complete`}>
              <div className="progress-ring__inner">
                <strong>{progress}%</strong>
                <span>today</span>
              </div>
            </div>
          </div>
          <div className="hero-card__footer">
            <span><CheckCircle2 size={15} aria-hidden="true" /> {state.reviewsToday} reviewed</span>
            <span>{state.dailyGoal - state.reviewsToday > 0 ? `${state.dailyGoal - state.reviewsToday} to goal` : "Goal complete"}</span>
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
            <button type="button" className="button button--ghost" onClick={onSnoozeReminder} disabled={!state.reminderEnabled}><Clock3 size={14} aria-hidden="true" /> {reminderSnoozedUntil ? "Snoozed" : "Snooze 1h"}</button>
          </div>
          {reminderSnoozedUntil && <span className="reminder-card__snooze">Paused until {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(reminderSnoozedUntil))}</span>}
        </aside>
      </section>

      <section className="stats-grid" aria-label="Your statistics">
        <StatCard icon={Flame} label="Current streak" value={`${state.streak} days`} detail={`Best: ${state.bestStreak} days`} tone="orange" />
        <StatCard icon={BookMarked} label="Mastered cards" value={String(state.mastered)} detail="+18 this month" tone="indigo" />
        <StatCard icon={Timer} label="Study time" value={`${state.studyMinutes} min`} detail="Today · 24 min goal" tone="mint" />
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
              <div className="mini-progress"><span style={{ width: "36%" }} /></div>
              <div className="continue-card__footer">
                <span>36% complete</span>
                <button type="button" className="inline-button" onClick={onStartReview}>Continue <ArrowRight size={15} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="flashcard-preview" aria-label="Flashcard preview">
              <div className="flashcard-preview__topline"><ArticleBadge article="der" compact /><span>Word</span></div>
              <strong>Bahnhof</strong>
              <span>railway station</span>
              <div className="flashcard-preview__example">Der Bahnhof ist in der Nähe.</div>
              <Volume2 size={16} aria-hidden="true" />
            </div>
          </article>

          <SectionHeading eyebrow="YOUR COLLECTION" title="Your decks" action={{ label: "View library", onClick: onOpenLibrary }} />
          <div className="deck-grid">
            <DeckCard icon={BookOpen} title="Menschen A1.1" subtitle="Course vocabulary" progress={36} count="180 cards" tone="indigo" />
            <DeckCard icon={Headphones} title="Everyday listening" subtitle="Phrases & dialogues" progress={12} count="42 cards" tone="mint" />
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

function DeckCard({ icon: Icon, title, subtitle, progress, count, tone }: { icon: LucideIcon; title: string; subtitle: string; progress: number; count: string; tone: "indigo" | "mint" }) {
  return (
    <article className="deck-card">
      <div className={`deck-card__icon deck-card__icon--${tone}`} aria-hidden="true"><Icon size={19} /></div>
      <span className="icon-button icon-button--small deck-card__menu" aria-hidden="true"><MoreHorizontal size={17} /></span>
      <span className="deck-card__subtitle">{subtitle}</span>
      <h3>{title}</h3>
      <div className="deck-card__progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="deck-card__footer"><span>{progress}% mastered</span><span>{count}</span></div>
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
              <div className="study-card__source"><BookOpen size={15} aria-hidden="true" /> {card.deck} <span>·</span> {card.lesson}</div>
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
  const answerRef = useRef<HTMLInputElement>(null);
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
    else answerRef.current?.focus();
  }, [index, submitted, mode]);

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
        <div><SlidersHorizontal size={17} aria-hidden="true" /><strong>Choose a drill</strong><span>Change the question without losing your library.</span></div>
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
            <div className="practice-answer__row"><input ref={answerRef} id="practice-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={mode === "article" ? "der / die / das" : mode === "plural" ? "Type the plural" : "Type your answer"} autoComplete="off" disabled={submitted} /><button type="submit" className="button button--primary" disabled={submitted || !answer.trim()}>{submitted ? "Checked" : "Check"} <Check size={16} aria-hidden="true" /></button></div>
          </form>

          {submitted && <div className="practice-result" role="status"><div className="practice-result__icon" aria-hidden="true">{isCorrect ? <CheckCircle2 size={21} /> : <Info size={21} />}</div><div><strong>{isCorrect ? "Sehr gut!" : "Almost — keep this one visible."}</strong><span>{isCorrect ? "That answer matches the card." : `Expected: ${expectedLabel}`}</span></div>{!isCorrect && <PronunciationButton text={expectedAudio} />}</div>}
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
}: {
  candidates: PdfCandidate[];
  sourcePreview: string;
  loading: boolean;
  error: string | null;
  onUseCandidate: (candidate: PdfCandidate) => void;
}) {
  if (!loading && !error && candidates.length === 0 && !sourcePreview) return null;

  return (
    <section className="pdf-import-card">
      <div className="pdf-import-card__heading">
        <div><span className="section-eyebrow">LOCAL PDF IMPORT</span><h2>{loading ? "Reading your PDF..." : "Review words from the PDF"}</h2><p>{loading ? "Text stays in this browser while Deutschly extracts lesson-friendly suggestions." : "Suggestions are never added automatically. Check the meaning and plural, then create the card."}</p></div>
        <div className="pdf-import-card__count" aria-label={`${candidates.length} word suggestions`}>{loading ? <RefreshCw size={17} aria-hidden="true" /> : candidates.length}</div>
      </div>

      {loading && <div className="pdf-import-card__loading"><span className="loading-bar" /><span className="loading-bar loading-bar--short" /></div>}
      {error && <div className="pdf-import-card__error" role="alert"><Info size={16} aria-hidden="true" /><span>{error}</span></div>}

      {!loading && candidates.length > 0 && (
        <div className="pdf-candidate-list">
          {candidates.slice(0, 12).map((candidate) => (
            <div className="pdf-candidate-row" key={candidate.id}>
              <ArticleBadge article={candidate.article} compact />
              <div className="pdf-candidate-row__copy"><strong>{candidate.german}</strong><span>Page {candidate.page} · {candidate.context}</span></div>
              <button type="button" className="button button--ghost" onClick={() => onUseCandidate(candidate)}>Use word <ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      )}

      {!loading && candidates.length > 12 && <span className="pdf-import-card__more">Showing 12 of {candidates.length} suggestions. Search the source preview or add another word manually.</span>}
      {!loading && candidates.length === 0 && !error && <div className="pdf-import-card__empty"><Sparkles size={17} aria-hidden="true" /><span>No article + noun patterns were detected. You can still add cards manually.</span></div>}

      {sourcePreview && (
        <details className="pdf-preview-details">
          <summary>Preview extracted text</summary>
          <pre>{sourcePreview}</pre>
        </details>
      )}
    </section>
  );
}

function ResourceShelf() {
  return (
    <details className="resource-shelf">
      <summary><BookText size={16} aria-hidden="true" /><span><strong>German resource shelf</strong><small>Extra practice and grammar references selected for this course</small></span><ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="resource-shelf__links">{germanResourceLinks.map((resource) => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer">{resource.label}<ExternalLink size={12} aria-hidden="true" /></a>)}</div>
    </details>
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
  pdfLoading,
  pdfError,
  onSearch,
  onAddCard,
  onEditCard,
  weakCardsOnly,
  onWeakCardsOnlyChange,
  onPdfUpload,
  onUsePdfCandidate,
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
  pdfLoading: boolean;
  pdfError: string | null;
  onSearch: (value: string) => void;
  onAddCard: () => void;
  onEditCard: (card: Flashcard) => void;
  weakCardsOnly: boolean;
  onWeakCardsOnlyChange: (value: boolean) => void;
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUsePdfCandidate: (candidate: PdfCandidate) => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [lessonFilter, setLessonFilter] = useState("all");
  const [articleFilter, setArticleFilter] = useState<"all" | Article>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CardStatus>("all");
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const lessons = [...new Set(cards.map((card) => card.lesson).filter(Boolean))].sort();
  const tags = [...new Set(cards.flatMap((card) => card.tags ?? []))].sort();
  const filteredCards = cards.filter((card) => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term || [card.german, card.translation, card.example, card.lesson, card.deck, ...(card.tags ?? [])].filter(Boolean).some((value) => value?.toLowerCase().includes(term));
    const matchesLesson = lessonFilter === "all" || card.lesson === lessonFilter;
    const matchesArticle = articleFilter === "all" || card.article === articleFilter;
    const matchesStatus = statusFilter === "all" || card.status === statusFilter;
    const matchesCheck = !needsCheckOnly || card.verification !== "reference-checked";
    const matchesWeak = !weakCardsOnly || card.status !== "review" || (card.difficulty ?? 5) >= 6;
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
        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="visually-hidden" onChange={onPdfUpload} />
        <div className="library-tools__actions">
          <button type="button" className="button button--outline" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}><UploadCloud size={17} aria-hidden="true" /> {pdfLoading ? "Reading PDF..." : sourceFileName ? "Replace PDF" : "Attach Menschen PDF"}</button>
          <button type="button" className="button button--ghost" onClick={onExportBackup}><Download size={16} aria-hidden="true" /> Export backup</button>
          <input ref={backupInputRef} type="file" accept=".json,application/json" className="visually-hidden" onChange={onImportBackup} />
          <button type="button" className="button button--ghost" onClick={() => backupInputRef.current?.click()}><Upload size={16} aria-hidden="true" /> Import backup</button>
        </div>
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
        <div className="library-source-card__stats"><div><strong>6</strong><span>lessons</span></div><div><strong>{sourcePageCount || "—"}</strong><span>PDF pages</span></div><div><strong>{sourceCandidateCount || "—"}</strong><span>suggestions</span></div></div>
      </section>

      {lessons.length > 0 && <section className="lesson-strip" aria-label="Menschen lessons">
        <div className="lesson-strip__heading"><BookText size={17} aria-hidden="true" /><div><span className="section-eyebrow">COURSE MAP</span><h2>Jump into a lesson</h2></div></div>
        <div className="lesson-strip__items">
          <button type="button" className={`lesson-chip${lessonFilter === "all" ? " lesson-chip--active" : ""}`} onClick={() => setLessonFilter("all")}><strong>All</strong><span>{cards.length} cards</span></button>
          {lessons.map((lesson) => <button type="button" className={`lesson-chip${lessonFilter === lesson ? " lesson-chip--active" : ""}`} key={lesson} onClick={() => setLessonFilter(lesson)}><strong>{lesson}</strong><span>{cards.filter((card) => card.lesson === lesson).length} cards</span></button>)}
        </div>
      </section>}

      <ResourceShelf />

      <PdfCandidatesCard candidates={pdfCandidates} sourcePreview={sourcePreview} loading={pdfLoading} error={pdfError} onUseCandidate={onUsePdfCandidate} />

      <section className="library-list-card">
        <div className="library-list-card__heading"><div><span className="section-eyebrow">ALL CARDS</span><h2>{filteredCards.length} cards</h2></div><span className="muted-label">Article colors are always labeled</span></div>
        <div className="library-table" role="table" aria-label="Flashcard library">
          <div className="library-table__header" role="row"><span>Word</span><span>Meaning</span><span>Lesson</span><span>State</span><span aria-hidden="true" /></div>
          {filteredCards.map((card) => (
            <div className="library-row" role="row" key={card.id}>
              <div className="library-row__word"><ArticleBadge article={card.article} compact /><strong>{card.german}</strong>{card.plural && <small>plural: {card.plural}</small>}{card.tags && card.tags.length > 0 && <small className="library-row__tags">{card.tags.join(" · ")}</small>}{card.sourcePage && <small>PDF page {card.sourcePage}</small>}{card.verification === "unverified" && <small className="verification-note">needs reference check</small>}</div>
              <span className="library-row__translation">{card.translation}</span>
              <span className="library-row__lesson">{card.lesson}</span>
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

function ProgressPage({ state, onViewWeakCards, onAdjustReminder }: { state: AppState; onViewWeakCards: () => void; onAdjustReminder: () => void }) {
  const maxValue = Math.max(...state.weeklyReviews, 1);
  const average = Math.round(state.weeklyReviews.reduce((sum, value) => sum + value, 0) / state.weeklyReviews.length);
  const level = getLevelProgress(state.xp);
  const accuracy = state.totalReviews > 0 ? Math.round((state.correctReviews / state.totalReviews) * 100) : 0;
  const mastery = Math.round(state.cards.reduce((sum, card) => sum + getCardMastery(card), 0) / Math.max(state.cards.length, 1));
  const weakCards = state.cards.filter((card) => card.status !== "review" || (card.difficulty ?? 5) >= 6).length;
  const achievementLabels: Record<string, { title: string; detail: string }> = {
    "first-review": { title: "First recall", detail: "Started your memory loop" },
    "week-streak": { title: "One gentle week", detail: "Kept a 7-day study streak" },
    "daily-goal": { title: "Daily goal", detail: "Completed a full review goal" },
    "xp-1500": { title: "Momentum maker", detail: "Reached 1,500 XP" },
  };
  return (
    <div className="page-stack progress-page">
      <section className="page-intro"><div><span className="page-kicker">KEEP THE MOMENTUM</span><h1>Your progress<span className="title-dot">.</span></h1><p>Consistency beats cramming. Here is the shape of your week.</p></div><div className="progress-summary"><span>Weekly average</span><strong>{average} reviews</strong></div></section>
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
          <div className="mastery-card__ring" aria-hidden="true"><div><strong>{mastery}%</strong><span>mastery</span></div></div>
          <div><span className="section-eyebrow">COURSE MASTERY</span><h2>Strong foundations</h2><p>{weakCards} card{weakCards === 1 ? "" : "s"} could use another gentle pass.</p><button type="button" className="text-button" onClick={onViewWeakCards}>See weak cards <ChevronRight size={16} aria-hidden="true" /></button></div>
        </article>
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
              <div><span>Plural</span><strong>{aiReview.plural || "—"}</strong></div>
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

function ProfileModal({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (name: string) => void }) {
  const [draftName, setDraftName] = useState(name);
  const previewAvatar = getDailyAvatar(draftName.trim() || PROFILE_NAME, getDayKey());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">YOUR LEARNING SPACE</span><h2 id="profile-title">Profile settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close profile settings" title="Close"><X size={19} aria-hidden="true" /></button></div>
        <p className="modal-panel__intro">Personalize the name Deutschly uses on your dashboard. Your avatar is generated locally and changes gently each day.</p>
        <div className="profile-preview"><div className="profile-preview__avatar"><Avatar name={previewAvatar.seed} variant={previewAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={58} title={false} aria-hidden="true" /></div><div><span className="section-eyebrow">LEARNER</span><strong>{draftName.trim() || "Your name"}</strong><small>Private on this device</small></div></div>
        <label className="form-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" value={draftName} onChange={(event) => setDraftName(event.target.value.slice(0, 32))} placeholder="e.g. Fatemeh" maxLength={32} autoComplete="name" /></label>
        <div className="modal-panel__footer"><span><Settings size={15} aria-hidden="true" /> You can change this any time.</span><div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={() => onSave(draftName)}>Save profile</button></div></div>
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
        <div className={`sync-status sync-status--${syncStatus}`} role="status"><Wifi size={15} aria-hidden="true" /><span>{syncStatus === "syncing" ? "Syncing now..." : syncStatus === "synced" ? "Connection is ready." : syncStatus === "offline" ? "Not connected yet." : syncStatus === "error" ? "Connection needs attention." : "Connection not tested yet."}</span><button type="button" className="text-button" onClick={onTestConnection} disabled={testingConnection || !endpoint.trim()}>{testingConnection ? "Testing..." : "Test connection"}</button></div>
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

function AddCardModal({ onClose, onSave, existingCards, initialDraft, editing = false, geminiEndpoint }: { onClose: () => void; onSave: (draft: CardDraft) => void; existingCards: Flashcard[]; initialDraft?: Partial<CardDraft>; editing?: boolean; geminiEndpoint: string }) {
  const [draft, setDraft] = useState<CardDraft>(() => createCardDraft(initialDraft));
  const [checkResult, setCheckResult] = useState<CardCheckResult | null>(null);
  const [referenceChecked, setReferenceChecked] = useState(false);
  const [aiReview, setAiReview] = useState<GeminiCardReview | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const germanInputRef = useRef<HTMLInputElement>(null);

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
        <form onSubmit={handleSubmit}>
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="card-german"><span>German *</span><input id="card-german" ref={germanInputRef} value={draft.german} onChange={(event) => update("german", event.target.value)} placeholder="e.g. gemütlich or Das Eis" required /></label>
            <label className="form-field" htmlFor="card-translation"><span>Translation *</span><input id="card-translation" value={draft.translation} onChange={(event) => update("translation", event.target.value)} placeholder="e.g. cozy or ice cream" required /></label>
          </div>
          <div className="form-grid form-grid--three">
            <label className="form-field" htmlFor="card-article"><span>Article</span><select id="card-article" value={draft.article} onChange={(event) => update("article", event.target.value as Article)}><option value="der">der · masculine</option><option value="die">die · feminine</option><option value="das">das · neuter</option><option value="plural">die · plural</option><option value="none">No article</option></select></label>
            <label className="form-field" htmlFor="card-plural"><span>Plural</span><input id="card-plural" value={draft.plural} onChange={(event) => update("plural", event.target.value)} placeholder="e.g. Bücher" /></label>
            <label className="form-field" htmlFor="card-kind"><span>Item type</span><select id="card-kind" value={draft.kind} onChange={(event) => update("kind", event.target.value as CardKind)}><option value="word">Vocabulary</option><option value="phrase">Phrase</option><option value="grammar">Grammar</option></select></label>
          </div>
          <label className="form-field" htmlFor="card-example"><span>Example sentence</span><textarea id="card-example" value={draft.example} onChange={(event) => update("example", event.target.value)} placeholder="Write a sentence you can imagine using..." rows={2} /></label>
          <label className="form-field" htmlFor="card-note"><span>Personal note</span><textarea id="card-note" value={draft.note} onChange={(event) => update("note", event.target.value)} placeholder="A memory hint, related word, or pronunciation note" rows={2} /></label>
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="card-tags"><span>Tags</span><input id="card-tags" value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. lesson-1, difficult, travel" /></label>
            <label className="form-field" htmlFor="card-source-page"><span>PDF page <small>(optional)</small></span><input id="card-source-page" type="number" min="1" value={draft.sourcePage ?? ""} onChange={(event) => update("sourcePage", event.target.value ? Number(event.target.value) : undefined)} placeholder="e.g. 14" /></label>
          </div>
          {checkResult && <CardCheckPanel result={checkResult} referenceChecked={referenceChecked} onReferenceChecked={setReferenceChecked} onApplySuggestion={applySuggestion} aiReview={aiReview} aiError={aiError} aiChecking={aiChecking} onAiCheck={() => void handleAiCheck()} onApplyAiReview={applyAiReview} />}
          <div className="modal-panel__footer">
            <span><Info size={15} aria-hidden="true" /> {checkResult ? "Confirm the details after checking the references." : "A quick check helps keep your library clean."}</span>
            <div>
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
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [pdfCandidates, setPdfCandidates] = useState<PdfCandidate[]>(() => state.pdfImport?.candidates ?? []);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [addCardSeed, setAddCardSeed] = useState<Partial<CardDraft> | undefined>(undefined);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState(() => loadLocalSetting(PROFILE_NAME_KEY) || PROFILE_NAME);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const profileAvatar = getDailyAvatar(profileName, todayKey);
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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

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

    const checkReminder = () => {
      const now = new Date();
      if (reminderSnoozedUntil) {
        if (Date.now() < reminderSnoozedUntil) return;
        setReminderSnoozedUntil(null);
        window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
      }
      const [reminderHours, reminderMinutes] = state.reminderTime.split(":").map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetMinutes = (Number.isFinite(reminderHours) ? reminderHours : 19) * 60 + (Number.isFinite(reminderMinutes) ? reminderMinutes : 0);
      if (currentMinutes < targetMinutes) return;

      const reminderKey = `deutschly:reminder:${getDayKey(now)}:${state.reminderTime}`;
      if (window.localStorage.getItem(reminderKey)) return;
      window.localStorage.setItem(reminderKey, "shown");

      const message = `${dueCards.length} card${dueCards.length === 1 ? "" : "s"} ready for review.`;
      if ("Notification" in window && Notification.permission === "granted") {
        const showNotification = async () => {
          try {
            if ("serviceWorker" in navigator) {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification("Deutschly review reminder", { body: message, icon: "./icon-192.svg", tag: reminderKey });
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

    checkReminder();
    const reminderTimer = window.setInterval(checkReminder, 60_000);
    return () => window.clearInterval(reminderTimer);
  }, [state.reminderEnabled, state.reminderTime, dueCards.length, reminderSnoozedUntil]);

  const handleOpenAddCard = (seed?: Partial<CardDraft>) => {
    setEditingCardId(null);
    setAddCardSeed(seed);
    setAddCardOpen(true);
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
    setState((current) => ({ ...current, cards: [newCard, ...current.cards], lastSyncedAt: createdAt }));
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
        pdfImport: { fileName: file.name, pageCount: result.pageCount, candidateCount: result.candidates.length, textPreview: result.textPreview, extractedAt, candidates: result.candidates },
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
    const payload = JSON.stringify({ app: "deutschly", version: 1, profile: profileName, exportedAt: new Date().toISOString(), state }, null, 2);
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

  const handleUsePdfCandidate = (candidate: PdfCandidate) => {
    handleOpenAddCard({
      german: candidate.german,
      article: candidate.article,
      sourcePage: candidate.page,
      tags: "Menschen, PDF",
      note: `Suggested from ${state.sourceFileName || "Menschen PDF"}, page ${candidate.page}. ${candidate.context}`,
    });
  };

  const handleReminderToggle = async () => {
    const nextEnabled = !state.reminderEnabled;
    if (nextEnabled && "Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "denied") showToast("Browser notifications are blocked; the in-app reminder will still be saved.");
    }
    setState((current) => ({ ...current, reminderEnabled: nextEnabled }));
  };
  const handleReminderTimeChange = (reminderTime: string) => {
    setState((current) => ({ ...current, reminderTime }));
    setReminderSnoozedUntil(null);
    window.localStorage.removeItem(REMINDER_SNOOZE_KEY);
  };
  const handleSnoozeReminder = () => {
    const until = Date.now() + 60 * 60_000;
    setReminderSnoozedUntil(until);
    window.localStorage.setItem(REMINDER_SNOOZE_KEY, String(until));
    showToast("Reminder snoozed for one hour.");
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
    if ("Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      showToast(permission === "granted" ? "Browser notifications are enabled." : "In-app reminders stay on while this page is open.");
      return;
    }
    showToast(state.reminderEnabled ? `Reminder set for ${state.reminderTime}. You can also add it to your calendar.` : "Reminders are paused");
  };
  const handleSaveProfile = (nextName: string) => {
    const trimmedName = nextName.trim().slice(0, 32);
    if (!trimmedName) {
      showToast("Add a name before saving your profile.");
      return;
    }
    setProfileName(trimmedName);
    window.localStorage.setItem(PROFILE_NAME_KEY, trimmedName);
    setProfileOpen(false);
    showToast("Profile updated.");
  };
  const handleViewWeakCards = () => {
    setWeakCardsOnly(true);
    setActiveTab("library");
    showToast("Showing cards that need another gentle pass.");
  };
  const toggleTheme = () => setState((current) => ({ ...current, theme: current.theme === "light" ? "dark" : "light" }));

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
          <div className="sidebar-profile"><div className="avatar" role="img" aria-label={`${profileName} profile avatar`}><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={32} title={false} aria-hidden="true" /></div><div><strong>{profileName}</strong><span>Personal learner</span></div><button type="button" className="icon-button icon-button--small" onClick={() => setProfileOpen(true)} aria-label="Open profile settings" title="Profile settings"><Settings size={16} aria-hidden="true" /></button></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__context"><div className="mobile-brand"><span className="brand__mark" aria-hidden="true"><BookOpen size={18} /></span><span className="brand__word">deutschly</span></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{navItems.find((item) => item.id === activeTab)?.label}</strong></div></div>
          <div className="topbar__actions">
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={state.theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={state.theme === "light" ? "Dark mode" : "Light mode"}>{state.theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</button>
            <button type="button" className="icon-button notification-button" onClick={handleReminderBell} aria-label="View reminders" title="Reminders"><Bell size={18} aria-hidden="true" />{state.reminderEnabled && dueCards.length > 0 && <span aria-hidden="true" />}</button>
            <button type="button" className={`sync-button${syncing ? " sync-button--syncing" : ""}`} onClick={() => void handleSync()} disabled={syncing}><Cloud size={16} aria-hidden="true" />{syncing ? "Syncing..." : syncConfigured ? "Sync now" : "Set up sync"}</button>
            <div className="topbar__avatar" role="img" aria-label={`Signed in as ${profileName}`}><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={34} title={false} aria-hidden="true" /></div>
          </div>
        </header>

        <main id="main-content" className="main-content">
          {activeTab === "overview" && <OverviewPage state={state} profileName={profileName} dueCards={dueCards} currentTime={currentTime} onStartReview={handleStartReview} onAddCard={() => handleOpenAddCard()} onOpenLibrary={() => handleTabChange("library")} onReminderToggle={handleReminderToggle} onReminderTimeChange={handleReminderTimeChange} onSnoozeReminder={handleSnoozeReminder} onAddReminderToCalendar={handleAddReminderToCalendar} reminderSnoozedUntil={reminderSnoozedUntil} />}
          {activeTab === "study" && <StudyPage dueCards={dueCards} reminderTime={state.reminderTime} sessionReviewed={studySession.reviewed} sessionTotal={studySession.total} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={handleRate} onBack={() => handleTabChange("overview")} onAddCard={() => handleOpenAddCard()} />}
          {activeTab === "practice" && <PracticePage cards={state.cards} onAddCard={() => handleOpenAddCard()} />}
          {activeTab === "library" && <LibraryPage cards={state.cards} searchQuery={searchQuery} sourceFileName={state.sourceFileName} sourcePageCount={state.pdfImport?.pageCount ?? 0} sourceCandidateCount={state.pdfImport?.candidateCount ?? 0} sourcePreview={state.pdfImport?.textPreview ?? ""} pdfCandidates={pdfCandidates} pdfLoading={pdfLoading} pdfError={pdfError} onSearch={setSearchQuery} onAddCard={() => handleOpenAddCard()} onEditCard={handleOpenEditCard} weakCardsOnly={weakCardsOnly} onWeakCardsOnlyChange={setWeakCardsOnly} onPdfUpload={handlePdfUpload} onUsePdfCandidate={handleUsePdfCandidate} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} />}
          {activeTab === "progress" && <ProgressPage state={state} onViewWeakCards={handleViewWeakCards} onAdjustReminder={() => handleTabChange("overview")} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={`mobile-nav__item${activeTab === id ? " mobile-nav__item--active" : ""}`} onClick={() => handleTabChange(id)} aria-current={activeTab === id ? "page" : undefined}>
            <span className="mobile-nav__icon"><Icon size={18} aria-hidden="true" />{id === "study" && dueCards.length > 0 && <span>{dueCards.length}</span>}</span><small>{id === "study" ? "Study" : label.replace("My ", "")}</small>
          </button>
        ))}
      </nav>

      {addCardOpen && <AddCardModal onClose={handleCloseAddCard} onSave={handleSaveCard} existingCards={state.cards.filter((card) => card.id !== editingCardId)} initialDraft={addCardSeed} editing={Boolean(editingCardId)} geminiEndpoint={syncEndpoint} />}
      {profileOpen && <ProfileModal name={profileName} onClose={() => setProfileOpen(false)} onSave={handleSaveProfile} />}
      {syncOpen && <SyncModal endpoint={syncEndpoint} room={syncRoom} error={syncError} autoSync={autoSync} syncStatus={syncStatus} testingConnection={testingConnection} onEndpointChange={(value) => { setSyncEndpoint(value); setSyncError(null); }} onRoomChange={(value) => { setSyncRoom(value); setSyncError(null); }} onAutoSyncChange={setAutoSync} onTestConnection={handleTestConnection} onCopyRoom={handleCopyRoom} onClose={() => setSyncOpen(false)} onSave={handleSaveSyncSettings} />}
      {toast && <div className="toast" role="status"><Check size={16} aria-hidden="true" /> {toast}</div>}
    </div>
  );
}
