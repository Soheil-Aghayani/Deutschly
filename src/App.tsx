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
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Flame,
  Headphones,
  Info,
  LayoutDashboard,
  Library,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Timer,
  Upload,
  UploadCloud,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getDailyAvatar } from "./lib/avatar";
import { extractMenschenPdf } from "./lib/pdfImport";
import type { PdfCandidate } from "./lib/pdfImport";
import { createSyncRoom, normalizeSyncRoom, pullSync, pushSync } from "./lib/sync";
import "./styles.css";

type Tab = "overview" | "study" | "library" | "progress";
type Article = "der" | "die" | "das" | "plural" | "none";
type CardKind = "word" | "phrase" | "grammar";
type ReviewRating = "again" | "hard" | "good" | "easy";
type CardStatus = "new" | "learning" | "review";
type Theme = "light" | "dark";
type VerificationStatus = "unverified" | "reference-checked";

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
  weeklyReviews: number[];
  reminderEnabled: boolean;
  reminderTime: string;
  theme: Theme;
  sourceFileName: string;
  pdfImport?: PdfImportSummary;
  lastReviewDay?: string;
  lastSyncedAt: string;
}

interface CardDraft {
  german: string;
  translation: string;
  article: Article;
  plural: string;
  example: string;
  note: string;
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
const PROFILE_NAME = "Fatemeh";
const PROFILE_AVATAR_COLORS = ["#EEF0FF", "#8D8BFF", "#56C39E", "#F6A261", "#F2B4BE"];

const navItems: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "study", label: "Study now", icon: Brain },
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
    weeklyReviews: [18, 24, 14, 28, 21, 31, 16],
    reminderEnabled: true,
    reminderTime: "19:00",
    theme: "light",
    sourceFileName: "",
    lastReviewDay: getDayKey(),
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

function normalizeAppState(value: unknown): AppState {
  const fallback = createInitialState();
  if (!isRecord(value)) return fallback;

  const cards = Array.isArray(value.cards) ? value.cards.filter(isFlashcard) : fallback.cards;
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
    weeklyReviews,
    reminderEnabled: typeof value.reminderEnabled === "boolean" ? value.reminderEnabled : fallback.reminderEnabled,
    reminderTime: typeof value.reminderTime === "string" ? value.reminderTime : fallback.reminderTime,
    theme: value.theme === "dark" ? "dark" : "light",
    sourceFileName: typeof value.sourceFileName === "string" ? value.sourceFileName : fallback.sourceFileName,
    pdfImport,
    lastReviewDay: typeof value.lastReviewDay === "string" ? value.lastReviewDay : fallback.lastReviewDay,
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

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardTimestamp(card: Flashcard): number {
  return Math.max(timestamp(card.updatedAt), timestamp(card.lastReviewedAt));
}

function mergeCards(localCards: Flashcard[], remoteCards: Flashcard[]): Flashcard[] {
  const merged = new Map<string, Flashcard>();

  [...remoteCards, ...localCards].forEach((card) => {
    const current = merged.get(card.id);
    if (!current || cardTimestamp(card) >= cardTimestamp(current)) merged.set(card.id, card);
  });

  return [...merged.values()];
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
    weeklyReviews,
    sourceFileName: pdfImport?.fileName ?? local.sourceFileName,
    pdfImport,
    lastReviewDay: latestReviewState.lastReviewDay,
    lastSyncedAt: local.lastSyncedAt,
  };
}

function createCardDraft(seed: Partial<CardDraft> = {}): CardDraft {
  return {
    german: "",
    translation: "",
    article: "der",
    plural: "",
    example: "",
    note: "",
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
}

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

  return { draft: prepared, match, items };
}

interface ReviewSchedule {
  due: string;
  interval: number;
  ease: number;
  repetitions: number;
  lapses: number;
  status: CardStatus;
}

function scheduleReview(card: Flashcard, rating: ReviewRating, todayKey: string): ReviewSchedule {
  const previousInterval = Math.max(0, card.interval);
  const previousEase = Math.min(3.3, Math.max(1.3, card.ease ?? 2.5));
  const previousRepetitions = Math.max(0, card.repetitions ?? (previousInterval > 0 ? 1 : 0));
  const previousLapses = Math.max(0, card.lapses ?? 0);
  let interval = 1;
  let ease = previousEase;
  let repetitions = previousRepetitions;
  let lapses = previousLapses;
  let status: CardStatus = "learning";

  if (rating === "again") {
    interval = 1;
    ease = Math.max(1.3, previousEase - 0.2);
    repetitions = 0;
    lapses += 1;
  } else if (rating === "hard") {
    interval = Math.max(2, Math.round(Math.max(1, previousInterval) * Math.max(1.2, previousEase - 0.7)));
    ease = Math.max(1.3, previousEase - 0.15);
    repetitions += 1;
    status = "review";
  } else if (rating === "good") {
    interval = previousInterval === 0 ? 4 : Math.max(3, Math.round(previousInterval * previousEase));
    repetitions += 1;
    status = "review";
  } else {
    ease = Math.min(3.3, previousEase + 0.15);
    interval = previousInterval === 0 ? 10 : Math.max(5, Math.round(previousInterval * ease * 1.3));
    repetitions += 1;
    status = "review";
  }

  return {
    due: addDays(todayKey, interval),
    interval,
    ease: Number(ease.toFixed(2)),
    repetitions,
    lapses,
    status,
  };
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
  dueCards,
  currentTime,
  onStartReview,
  onAddCard,
  onOpenLibrary,
  onReminderToggle,
  onReminderTimeChange,
}: {
  state: AppState;
  dueCards: Flashcard[];
  currentTime: Date;
  onStartReview: () => void;
  onAddCard: () => void;
  onOpenLibrary: () => void;
  onReminderToggle: () => void;
  onReminderTimeChange: (value: string) => void;
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
          <h1>{greeting}, Fatemeh<span className="title-dot">.</span></h1>
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
        </aside>
      </section>

      <section className="stats-grid" aria-label="Your statistics">
        <StatCard icon={Flame} label="Current streak" value={`${state.streak} days`} detail="Best: 14 days" tone="orange" />
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
  showAnswer,
  onShowAnswer,
  onRate,
  onBack,
  onAddCard,
}: {
  dueCards: Flashcard[];
  reminderTime: string;
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

  const progress = Math.max(10, Math.round((1 / Math.max(dueCards.length, 1)) * 100));

  return (
    <div className="page-stack study-page">
      <div className="study-topbar">
        <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back to overview</button>
        <div className="study-counter"><strong>1</strong><span>of {dueCards.length} cards</span></div>
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
            <div className={`study-answer${showAnswer ? " study-answer--visible" : ""}`}>
              {showAnswer ? (
                <>
                  <div className="study-answer__translation">{card.translation}</div>
                  {card.example && <div className="study-answer__example"><span>Example</span><p>{card.example}</p><Volume2 size={16} aria-hidden="true" /></div>}
                  {card.note && <div className="study-answer__note"><Info size={14} aria-hidden="true" /> {card.note}</div>}
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
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUsePdfCandidate: (candidate: PdfCandidate) => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const filteredCards = cards.filter((card) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return [card.german, card.translation, card.example, card.lesson, card.deck].filter(Boolean).some((value) => value?.toLowerCase().includes(term));
  });

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

      <section className="library-source-card">
        <div className="library-source-card__icon" aria-hidden="true"><FileText size={22} /></div>
        <div className="library-source-card__copy"><span className="section-eyebrow">COURSE SOURCE</span><h2>Menschen A1.1</h2><p>{sourceFileName ? `${sourceFileName} attached · text extracted locally for lesson-based card creation` : "Attach your PDF to keep lesson references beside every card."}</p></div>
        <div className="library-source-card__stats"><div><strong>6</strong><span>lessons</span></div><div><strong>{sourcePageCount || "—"}</strong><span>PDF pages</span></div><div><strong>{sourceCandidateCount || "—"}</strong><span>suggestions</span></div></div>
      </section>

      <PdfCandidatesCard candidates={pdfCandidates} sourcePreview={sourcePreview} loading={pdfLoading} error={pdfError} onUseCandidate={onUsePdfCandidate} />

      <section className="library-list-card">
        <div className="library-list-card__heading"><div><span className="section-eyebrow">ALL CARDS</span><h2>{filteredCards.length} cards</h2></div><span className="muted-label">Article colors are always labeled</span></div>
        <div className="library-table" role="table" aria-label="Flashcard library">
          <div className="library-table__header" role="row"><span>Word</span><span>Meaning</span><span>Lesson</span><span>State</span><span aria-hidden="true" /></div>
          {filteredCards.map((card) => (
            <div className="library-row" role="row" key={card.id}>
              <div className="library-row__word"><ArticleBadge article={card.article} compact /><strong>{card.german}</strong>{card.plural && <small>plural: {card.plural}</small>}{card.verification === "unverified" && <small className="verification-note">needs reference check</small>}</div>
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
  return (
    <div className="page-stack progress-page">
      <section className="page-intro"><div><span className="page-kicker">KEEP THE MOMENTUM</span><h1>Your progress<span className="title-dot">.</span></h1><p>Consistency beats cramming. Here is the shape of your week.</p></div><div className="progress-summary"><span>Weekly average</span><strong>{average} reviews</strong></div></section>
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
          <div className="mastery-card__ring" aria-hidden="true"><div><strong>68%</strong><span>mastery</span></div></div>
          <div><span className="section-eyebrow">COURSE MASTERY</span><h2>Strong foundations</h2><p>Keep revisiting the cards that feel just a little slippery.</p><button type="button" className="text-button" onClick={onViewWeakCards}>See weak cards <ChevronRight size={16} aria-hidden="true" /></button></div>
        </article>
      </section>
      <section className="progress-metrics">
        <StatCard icon={Flame} label="Longest streak" value="14 days" detail="You are at 50% of your best" tone="orange" />
        <StatCard icon={CheckCircle2} label="Easy recalls" value="74%" detail="Up 8% from last week" tone="mint" />
        <StatCard icon={Target} label="Goal completion" value="82%" detail="Your most consistent metric" tone="indigo" />
      </section>
      <article className="insight-card"><div className="insight-card__icon" aria-hidden="true"><Sparkles size={19} /></div><div><span className="section-eyebrow">A SMALL INSIGHT</span><h2>Your best study window is early evening.</h2><p>You remember 22% more cards when you review within two hours of your reminder.</p></div><button type="button" className="button button--outline" onClick={onAdjustReminder}>Adjust reminder <ArrowRight size={16} aria-hidden="true" /></button></article>
    </div>
  );
}

function CardCheckPanel({ result, referenceChecked, onReferenceChecked }: { result: CardCheckResult; referenceChecked: boolean; onReferenceChecked: (checked: boolean) => void }) {
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

function SyncModal({
  endpoint,
  room,
  error,
  onEndpointChange,
  onRoomChange,
  onClose,
  onSave,
}: {
  endpoint: string;
  room: string;
  error: string | null;
  onEndpointChange: (value: string) => void;
  onRoomChange: (value: string) => void;
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
        <p className="modal-panel__intro">Run the Deutschly sync server on your PC, then use the same room code on your phone. Your cards stay in this private room instead of going to a third-party service.</p>
        <div className="sync-modal__steps" aria-label="Sync setup steps">
          <div><strong>1</strong><span>On the PC, run <code>npm run sync-server</code>.</span></div>
          <div><strong>2</strong><span>Open the app on both devices over the same Wi-Fi network.</span></div>
          <div><strong>3</strong><span>Save this connection, then tap <em>Sync now</em>.</span></div>
        </div>
        <div className="form-grid">
          <label className="form-field" htmlFor="sync-endpoint"><span>Sync server URL</span><input id="sync-endpoint" value={endpoint} onChange={(event) => onEndpointChange(event.target.value)} placeholder="/api/sync or http://192.168.1.20:8787/api/sync" /></label>
          <label className="form-field" htmlFor="sync-room"><span>Room code</span><input id="sync-room" value={room} onChange={(event) => onRoomChange(normalizeSyncRoom(event.target.value))} placeholder="8 characters" maxLength={32} autoCapitalize="characters" spellCheck={false} /></label>
        </div>
        <div className="sync-modal__warning"><Info size={15} aria-hidden="true" /><span>Anyone with this room code can read and write its data. Use it only on a trusted network; this starter server is not for public internet use without HTTPS and authentication.</span></div>
        {error && <div className="sync-modal__error" role="alert"><X size={15} aria-hidden="true" /><span>{error}</span></div>}
        <div className="modal-panel__footer">
          <span><Cloud size={15} aria-hidden="true" /> {room ? `Room ${room}` : "Choose a room code"}</span>
          <div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="button" className="button button--primary" onClick={onSave} disabled={room.length < 6 || !endpoint.trim()}><Cloud size={16} aria-hidden="true" /> Save connection</button></div>
        </div>
      </section>
    </div>
  );
}

function AddCardModal({ onClose, onSave, existingCards, initialDraft }: { onClose: () => void; onSave: (draft: CardDraft) => void; existingCards: Flashcard[]; initialDraft?: Partial<CardDraft> }) {
  const [draft, setDraft] = useState<CardDraft>(() => createCardDraft(initialDraft));
  const [checkResult, setCheckResult] = useState<CardCheckResult | null>(null);
  const [referenceChecked, setReferenceChecked] = useState(false);
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
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.german.trim() || !draft.translation.trim()) return;
    const result = getCardCheck(existingCards, draft);
    setDraft(result.draft);
    setCheckResult(result);
    setReferenceChecked(false);
  };

  const handleConfirm = () => {
    if (!checkResult || checkResult.match?.type === "exact" || !referenceChecked) return;
    onSave({ ...checkResult.draft, referenceChecked: true });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-card-title">
        <div className="modal-panel__heading"><div><span className="section-eyebrow">PERSONAL LIBRARY</span><h2 id="add-card-title">Add a flashcard</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close add card dialog" title="Close"><X size={19} aria-hidden="true" /></button></div>
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
          {checkResult && <CardCheckPanel result={checkResult} referenceChecked={referenceChecked} onReferenceChecked={setReferenceChecked} />}
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
  const [showAnswer, setShowAnswer] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncEndpoint, setSyncEndpoint] = useState(() => loadLocalSetting(SYNC_ENDPOINT_KEY));
  const [syncRoom, setSyncRoom] = useState(() => loadLocalSetting(SYNC_ROOM_KEY) || createSyncRoom());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [pdfCandidates, setPdfCandidates] = useState<PdfCandidate[]>(() => state.pdfImport?.candidates ?? []);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [addCardSeed, setAddCardSeed] = useState<Partial<CardDraft> | undefined>(undefined);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const todayKey = getDayKey();
  const profileAvatar = getDailyAvatar(PROFILE_NAME, todayKey);
  const dueCards = useMemo(() => state.cards.filter((card) => card.due <= todayKey), [state.cards, todayKey]);
  const syncConfigured = Boolean(syncEndpoint.trim() && syncRoom.length >= 6);

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
      const currentTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (currentTimeLabel !== state.reminderTime) return;

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
  }, [state.reminderEnabled, state.reminderTime, dueCards.length]);

  const handleOpenAddCard = (seed?: Partial<CardDraft>) => {
    setAddCardSeed(seed);
    setAddCardOpen(true);
  };

  const handleCloseAddCard = () => {
    setAddCardOpen(false);
    setAddCardSeed(undefined);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab !== "study") setShowAnswer(false);
  };

  const handleStartReview = () => {
    setActiveTab("study");
    setShowAnswer(false);
  };

  function handleRate(rating: ReviewRating) {
    const card = dueCards[0];
    if (!card) return;
    const schedule = scheduleReview(card, rating, todayKey);
    const reviewedAt = new Date().toISOString();
    setState((current) => {
      const nextCards = current.cards.map((item) => item.id === card.id ? { ...item, ...schedule, lastReviewedAt: reviewedAt, updatedAt: reviewedAt } : item);
      const weeklyReviews = [...current.weeklyReviews];
      const lastIndex = weeklyReviews.length - 1;
      if (lastIndex >= 0) weeklyReviews[lastIndex] = (weeklyReviews[lastIndex] ?? 0) + 1;
      const reviewsToday = current.lastReviewDay === todayKey ? current.reviewsToday : 0;
      const becameMastered = rating === "easy" && card.status !== "review";
      return { ...current, cards: nextCards, reviewsToday: reviewsToday + 1, lastReviewDay: todayKey, studyMinutes: current.studyMinutes + 1, mastered: becameMastered ? current.mastered + 1 : current.mastered, weeklyReviews, lastSyncedAt: reviewedAt };
    });
    setShowAnswer(false);
    showToast(`${rating === "again" ? "We’ll bring it back tomorrow" : `Next review in ${schedule.interval} days`}`);
  }

  const handleCreateCard = (draft: CardDraft) => {
    const preparedDraft = prepareCardDraft(draft);
    const duplicate = findCardMatch(state.cards, preparedDraft);
    if (duplicate?.type === "exact") {
      showToast(`${duplicate.card.german} is already in your library`);
      return;
    }

    const createdAt = new Date().toISOString();
    const newCard: Flashcard = {
      id: `custom-${Date.now()}`,
      german: preparedDraft.german,
      translation: preparedDraft.translation,
      article: preparedDraft.article,
      plural: preparedDraft.plural || undefined,
      example: preparedDraft.example || undefined,
      note: preparedDraft.note || undefined,
      lesson: preparedDraft.lesson,
      deck: "My cards",
      kind: preparedDraft.kind,
      due: todayKey,
      interval: 0,
      status: "new",
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
    setSyncError(null);
    setSyncOpen(false);
    showToast("Sync connection saved. Tap Sync now when both devices are ready.");
  };

  const handleSync = async () => {
    if (syncing) return;
    if (!syncConfigured) {
      setSyncError(null);
      setSyncOpen(true);
      return;
    }

    setSyncing(true);
    setSyncError(null);
    try {
      const remote = await pullSync(syncEndpoint, syncRoom);
      const remoteState = remote ? normalizeAppState(remote.state) : null;
      const mergedState = remoteState ? mergeAppStates(state, remoteState) : state;
      const response = await pushSync(syncEndpoint, syncRoom, mergedState);
      const syncedAt = response.updatedAt || new Date().toISOString();
      setState({ ...mergedState, lastSyncedAt: syncedAt });
      showToast(remote ? `Synced ${mergedState.cards.length} cards across devices.` : "Sync room created. Your cards are ready on the other device.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The sync server could not be reached.";
      setSyncError(message);
      setSyncOpen(true);
      showToast("Sync failed. Check the server URL and room code.");
    } finally {
      setSyncing(false);
    }
  };

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
    const payload = JSON.stringify({ app: "deutschly", version: 1, profile: PROFILE_NAME, exportedAt: new Date().toISOString(), state }, null, 2);
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
  const handleReminderTimeChange = (reminderTime: string) => setState((current) => ({ ...current, reminderTime }));
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
    showToast(state.reminderEnabled ? `Reminder set for ${state.reminderTime}` : "Reminders are paused");
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
          <div className="sidebar-profile"><div className="avatar" role="img" aria-label={`${PROFILE_NAME} profile avatar`}><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={32} title={false} aria-hidden="true" /></div><div><strong>{PROFILE_NAME}</strong><span>Personal learner</span></div><button type="button" className="icon-button icon-button--small" onClick={() => showToast("Profile settings are coming next")} aria-label="Open profile settings" title="Profile settings"><Settings size={16} aria-hidden="true" /></button></div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__context"><div className="mobile-brand"><span className="brand__mark" aria-hidden="true"><BookOpen size={18} /></span><span className="brand__word">deutschly</span></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{navItems.find((item) => item.id === activeTab)?.label}</strong></div></div>
          <div className="topbar__actions">
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={state.theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={state.theme === "light" ? "Dark mode" : "Light mode"}>{state.theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</button>
            <button type="button" className="icon-button notification-button" onClick={handleReminderBell} aria-label="View reminders" title="Reminders"><Bell size={18} aria-hidden="true" /><span aria-hidden="true" /></button>
            <button type="button" className={`sync-button${syncing ? " sync-button--syncing" : ""}`} onClick={handleSync} disabled={syncing}><Cloud size={16} aria-hidden="true" />{syncing ? "Syncing..." : syncConfigured ? "Sync now" : "Set up sync"}</button>
            <div className="topbar__avatar" role="img" aria-label={`Signed in as ${PROFILE_NAME}`}><Avatar name={profileAvatar.seed} variant={profileAvatar.variant} colors={PROFILE_AVATAR_COLORS} size={34} title={false} aria-hidden="true" /></div>
          </div>
        </header>

        <main id="main-content" className="main-content">
          {activeTab === "overview" && <OverviewPage state={state} dueCards={dueCards} currentTime={currentTime} onStartReview={handleStartReview} onAddCard={() => handleOpenAddCard()} onOpenLibrary={() => handleTabChange("library")} onReminderToggle={handleReminderToggle} onReminderTimeChange={handleReminderTimeChange} />}
          {activeTab === "study" && <StudyPage dueCards={dueCards} reminderTime={state.reminderTime} showAnswer={showAnswer} onShowAnswer={() => setShowAnswer(true)} onRate={handleRate} onBack={() => handleTabChange("overview")} onAddCard={() => handleOpenAddCard()} />}
          {activeTab === "library" && <LibraryPage cards={state.cards} searchQuery={searchQuery} sourceFileName={state.sourceFileName} sourcePageCount={state.pdfImport?.pageCount ?? 0} sourceCandidateCount={state.pdfImport?.candidateCount ?? 0} sourcePreview={state.pdfImport?.textPreview ?? ""} pdfCandidates={pdfCandidates} pdfLoading={pdfLoading} pdfError={pdfError} onSearch={setSearchQuery} onAddCard={() => handleOpenAddCard()} onEditCard={(card) => showToast(`Editing ${card.german} will be available next`)} onPdfUpload={handlePdfUpload} onUsePdfCandidate={handleUsePdfCandidate} onExportBackup={handleExportBackup} onImportBackup={handleImportBackup} />}
          {activeTab === "progress" && <ProgressPage state={state} onViewWeakCards={() => showToast("Weak-card mode is next on the roadmap")} onAdjustReminder={() => handleTabChange("overview")} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={`mobile-nav__item${activeTab === id ? " mobile-nav__item--active" : ""}`} onClick={() => handleTabChange(id)} aria-current={activeTab === id ? "page" : undefined}>
            <span className="mobile-nav__icon"><Icon size={18} aria-hidden="true" />{id === "study" && dueCards.length > 0 && <span>{dueCards.length}</span>}</span><small>{id === "study" ? "Study" : label.replace("My ", "")}</small>
          </button>
        ))}
      </nav>

      {addCardOpen && <AddCardModal onClose={handleCloseAddCard} onSave={handleCreateCard} existingCards={state.cards} initialDraft={addCardSeed} />}
      {syncOpen && <SyncModal endpoint={syncEndpoint} room={syncRoom} error={syncError} onEndpointChange={(value) => { setSyncEndpoint(value); setSyncError(null); }} onRoomChange={(value) => { setSyncRoom(value); setSyncError(null); }} onClose={() => setSyncOpen(false)} onSave={handleSaveSyncSettings} />}
      {toast && <div className="toast" role="status"><Check size={16} aria-hidden="true" /> {toast}</div>}
    </div>
  );
}
