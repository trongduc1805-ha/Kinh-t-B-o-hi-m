import {
  Chapter,
  ChapterStats,
  MemoryLevel,
  Question,
  QuestionProgress,
  SavedChapterSession,
  SessionMode,
  SRSScheduleSettings,
} from '../types';

const PROGRESS_STORAGE_KEY = 'ktbh_srs_progress_v1';
const SESSIONS_STORAGE_KEY = 'ktbh_srs_sessions_v1';
const SETTINGS_STORAGE_KEY = 'ktbh_srs_settings_v2';

// Mặc định gấp cho giai đoạn ôn thi, quy theo phút
export const DEFAULT_SCHEDULE_SETTINGS: SRSScheduleSettings = {
  level1Minutes: 3,       // Mức 1: ôn lại trong phiên & sau 3 phút
  level2Minutes: 10,      // Mức 2: sau 10 phút
  level3Minutes: 30,      // Mức 3: sau 30 phút
  level4StartMinutes: 60, // Mức 4 khởi đầu: 60 phút
  level4MaxMinutes: 180,  // Mức 4 tối đa: 180 phút
};

export function makeQuestionKey(chapterId: number, questionId: number | string): string {
  return `${chapterId}_${questionId}`;
}

export function getScheduleSettings(): SRSScheduleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SCHEDULE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      level1Minutes: Math.max(1, Number(parsed.level1Minutes) || DEFAULT_SCHEDULE_SETTINGS.level1Minutes),
      level2Minutes: Math.max(1, Number(parsed.level2Minutes) || DEFAULT_SCHEDULE_SETTINGS.level2Minutes),
      level3Minutes: Math.max(1, Number(parsed.level3Minutes) || DEFAULT_SCHEDULE_SETTINGS.level3Minutes),
      level4StartMinutes: Math.max(1, Number(parsed.level4StartMinutes) || DEFAULT_SCHEDULE_SETTINGS.level4StartMinutes),
      level4MaxMinutes: Math.max(1, Number(parsed.level4MaxMinutes) || DEFAULT_SCHEDULE_SETTINGS.level4MaxMinutes),
    };
  } catch {
    return DEFAULT_SCHEDULE_SETTINGS;
  }
}

export function saveScheduleSettings(settings: SRSScheduleSettings): SRSScheduleSettings {
  const startMins = Math.max(1, Math.round(settings.level4StartMinutes));
  const sanitized: SRSScheduleSettings = {
    level1Minutes: Math.max(1, Math.round(settings.level1Minutes)),
    level2Minutes: Math.max(1, Math.round(settings.level2Minutes)),
    level3Minutes: Math.max(1, Math.round(settings.level3Minutes)),
    level4StartMinutes: startMins,
    level4MaxMinutes: Math.max(startMins, Math.round(settings.level4MaxMinutes)),
  };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Failed to save SRS schedule settings:', e);
  }
  return sanitized;
}

export function resetScheduleSettings(): SRSScheduleSettings {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_SCHEDULE_SETTINGS;
}

export function getAllProgress(): Record<string, QuestionProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveAllProgress(map: Record<string, QuestionProgress>): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save SRS progress:', e);
  }
}

export function getQuestionProgress(
  chapterId: number,
  questionId: number | string,
  allProgress?: Record<string, QuestionProgress>
): QuestionProgress | undefined {
  const map = allProgress || getAllProgress();
  return map[makeQuestionKey(chapterId, questionId)];
}

export function previewNextIntervalMinutes(
  prev: QuestionProgress | undefined,
  level: MemoryLevel,
  isCorrect: boolean,
  settings: SRSScheduleSettings
): { intervalMinutes: number; consecutiveMastered: number } {
  if (!isCorrect || level === 1) {
    return {
      intervalMinutes: settings.level1Minutes,
      consecutiveMastered: 0,
    };
  }

  if (level === 2) {
    return {
      intervalMinutes: settings.level2Minutes,
      consecutiveMastered: 0,
    };
  }

  if (level === 3) {
    const prevInterval = prev?.intervalMinutes || 0;
    const base = settings.level3Minutes;
    const grown =
      prev && !prev.lastWasWrong && prev.lastLevel >= 3 && prevInterval >= base
        ? Math.min(settings.level4StartMinutes, Math.round(prevInterval * 1.2))
        : base;
    return {
      intervalMinutes: Math.min(settings.level4MaxMinutes, grown),
      consecutiveMastered: prev?.consecutiveMastered || 0,
    };
  }

  // level === 4 & isCorrect === true
  const nextStreak = (prev?.consecutiveMastered || 0) + 1;
  if (nextStreak <= 1) {
    return {
      intervalMinutes: Math.min(settings.level4MaxMinutes, settings.level4StartMinutes),
      consecutiveMastered: nextStreak,
    };
  }

  const prevInterval = Math.max(settings.level4StartMinutes, prev?.intervalMinutes || settings.level4StartMinutes);
  const grown = Math.round(prevInterval * 1.25);
  return {
    intervalMinutes: Math.min(settings.level4MaxMinutes, Math.max(settings.level4StartMinutes, grown)),
    consecutiveMastered: nextStreak,
  };
}

export function recordQuestionReview(
  chapterId: number,
  questionId: number | string,
  chosenLevel: MemoryLevel,
  isCorrect: boolean,
  now = Date.now()
): QuestionProgress {
  const map = getAllProgress();
  const key = makeQuestionKey(chapterId, questionId);
  const prev = map[key];
  const settings = getScheduleSettings();

  // Nếu trả lời sai, mức tối đa ghi nhận là 2 (nếu user chọn 3/4 sẽ hạ xuống 1)
  const effectiveLevel: MemoryLevel = !isCorrect && chosenLevel > 2 ? 1 : chosenLevel;

  const { intervalMinutes, consecutiveMastered } = previewNextIntervalMinutes(
    prev,
    effectiveLevel,
    isCorrect,
    settings
  );

  const updated: QuestionProgress = {
    questionKey: key,
    chapterId,
    questionId,
    lastLevel: effectiveLevel,
    reviewCount: (prev?.reviewCount || 0) + 1,
    correctCount: (prev?.correctCount || 0) + (isCorrect ? 1 : 0),
    wrongCount: (prev?.wrongCount || 0) + (isCorrect ? 0 : 1),
    consecutiveMastered,
    lastReviewedAt: now,
    nextReviewAt: now + intervalMinutes * 60 * 1000,
    intervalMinutes,
    lastWasWrong: !isCorrect,
  };

  map[key] = updated;
  saveAllProgress(map);
  return updated;
}

export function formatIntervalLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 1440) {
    return `${rounded} phút`;
  }
  const days = rounded / 1440;
  return Number.isInteger(days) ? `${days} ngày` : `${days.toFixed(1)} ngày`;
}

export function getChapterStats(chapter: Chapter, now = Date.now()): ChapterStats {
  const map = getAllProgress();
  const stats: ChapterStats = {
    total: chapter.questions?.length || 0,
    unseen: 0,
    unmastered: 0,
    mastered: 0,
    due: 0,
    wrong: 0,
    level1: 0,
    level2: 0,
    level3: 0,
    level4: 0,
  };

  (chapter.questions || []).forEach((q) => {
    const p = map[makeQuestionKey(chapter.chapter, q.id)];
    if (!p) {
      stats.unseen++;
      return;
    }

    if (p.lastLevel === 1) stats.level1++;
    else if (p.lastLevel === 2) stats.level2++;
    else if (p.lastLevel === 3) stats.level3++;
    else if (p.lastLevel === 4) stats.level4++;

    if (p.lastWasWrong) {
      stats.wrong++;
    }

    const isMastered = p.lastLevel === 4 && !p.lastWasWrong;
    if (isMastered) {
      stats.mastered++;
    } else {
      stats.unmastered++;
    }

    if (p.nextReviewAt <= now) {
      stats.due++;
    }
  });

  return stats;
}

export function getSessionModeLabel(mode: SessionMode): string {
  switch (mode) {
    case 'smart':
      return 'Ôn ưu tiên hôm nay';
    case 'due':
      return 'Câu đến hạn ôn';
    case 'unmastered':
      return 'Câu chưa thuộc';
    case 'wrong':
      return 'Câu trả lời sai';
    case 'level1':
      return 'Mức 1 · Rất khó';
    case 'level2':
      return 'Mức 2 · Khó';
    case 'level3':
      return 'Mức 3 · Khá nhớ';
    case 'level4':
      return 'Mức 4 · Đã thuộc';
    case 'all':
      return 'Toàn bộ chương';
  }
}

export function buildSessionQuestions(
  chapter: Chapter,
  mode: SessionMode,
  newLimit = 10,
  now = Date.now()
): Question[] {
  const map = getAllProgress();
  const questions = chapter.questions || [];

  const withProg = questions.map((q) => ({
    q,
    p: map[makeQuestionKey(chapter.chapter, q.id)],
  }));

  if (mode === 'smart') {
    // 1. Câu đến hạn ôn (chỉ xét các câu đã từng học và đến hạn)
    const dueList = withProg
      .filter(({ p }) => p && p.nextReviewAt <= now)
      .sort((a, b) => {
        // Ưu tiên mức thấp / sai gần nhất trước, sau đó đến hạn sớm hơn
        if (a.p!.lastLevel !== b.p!.lastLevel) return a.p!.lastLevel - b.p!.lastLevel;
        return a.p!.nextReviewAt - b.p!.nextReviewAt;
      })
      .map(({ q }) => q);

    const dueIds = new Set(dueList.map((q) => q.id));

    // 2. Các câu chưa thuộc (mức 1 hoặc bị sai gần nhất dù chưa hết 15p vẫn ưu tiên nếu đến hạn; mức 2-3 chưa đến hạn không ép lặp lại ngay, trừ khi không còn câu đến hạn và không thêm câu mới? Theo yêu cầu 5: "ưu tiên các câu đến hạn ôn và chưa thuộc, sau đó mới đưa thêm câu mới... Những câu chưa đến hạn không cần xuất hiện lại trong phiên thông thường")
    // Tuy nhiên câu mức 1 hoặc câu trả lời sai gần nhất (lastWasWrong) luôn được ưu tiên ôn lại nếu chưa thuộc
    const urgentUnmastered = withProg
      .filter(({ q, p }) => p && !dueIds.has(q.id) && (p.lastWasWrong || p.lastLevel === 1))
      .sort((a, b) => a.p!.lastReviewedAt - b.p!.lastReviewedAt)
      .map(({ q }) => q);

    // 3. Câu mới chưa học theo số lượng người học chọn
    const unseen = withProg
      .filter(({ p }) => !p)
      .map(({ q }) => q);
    const limitedNew = newLimit < 0 ? unseen : unseen.slice(0, newLimit);

    return [...dueList, ...urgentUnmastered, ...limitedNew];
  }

  if (mode === 'due') {
    return withProg
      .filter(({ p }) => p && p.nextReviewAt <= now)
      .sort((a, b) => {
        if (a.p!.lastLevel !== b.p!.lastLevel) return a.p!.lastLevel - b.p!.lastLevel;
        return a.p!.nextReviewAt - b.p!.nextReviewAt;
      })
      .map(({ q }) => q);
  }

  if (mode === 'unmastered') {
    return withProg
      .filter(({ p }) => p && (p.lastLevel < 4 || p.lastWasWrong))
      .sort((a, b) => {
        if (a.p!.lastLevel !== b.p!.lastLevel) return a.p!.lastLevel - b.p!.lastLevel;
        return a.p!.nextReviewAt - b.p!.nextReviewAt;
      })
      .map(({ q }) => q);
  }

  if (mode === 'wrong') {
    return withProg
      .filter(({ p }) => p && p.lastWasWrong)
      .sort((a, b) => b.p!.wrongCount - a.p!.wrongCount)
      .map(({ q }) => q);
  }

  if (mode === 'level1' || mode === 'level2' || mode === 'level3' || mode === 'level4') {
    const targetLevel = Number(mode.replace('level', '')) as MemoryLevel;
    return withProg
      .filter(({ p }) => p && p.lastLevel === targetLevel)
      .sort((a, b) => a.p!.nextReviewAt - b.p!.nextReviewAt)
      .map(({ q }) => q);
  }

  // 'all'
  return [...questions];
}

// Session Persistence
function getAllSessions(): Record<number, SavedChapterSession> {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveAllSessions(sessions: Record<number, SavedChapterSession>): void {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save chapter sessions:', e);
  }
}

export function getSavedSession(chapterId: number): SavedChapterSession | null {
  const all = getAllSessions();
  const s = all[chapterId];
  if (!s || !Array.isArray(s.questionIds) || s.questionIds.length === 0) return null;
  return s;
}

export function saveChapterSession(session: SavedChapterSession): void {
  const all = getAllSessions();
  all[session.chapterId] = {
    ...session,
    updatedAt: Date.now(),
  };
  saveAllSessions(all);
}

export function clearChapterSession(chapterId: number): void {
  const all = getAllSessions();
  if (all[chapterId]) {
    delete all[chapterId];
    saveAllSessions(all);
  }
}

export function resetChapterProgress(chapterId: number): void {
  const map = getAllProgress();
  let changed = false;
  Object.keys(map).forEach((key) => {
    if (map[key].chapterId === chapterId) {
      delete map[key];
      changed = true;
    }
  });
  if (changed) {
    saveAllProgress(map);
  }
  clearChapterSession(chapterId);
}
