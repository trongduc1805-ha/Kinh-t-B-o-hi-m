export interface SourceReference {
  cell_type: string;
  cell_index: number;
  topic: string;
}

export interface Question {
  id: number | string;
  chapterId?: number;
  difficulty?: string;
  bloom_level?: string;
  question_type?: string;
  knowledge_area?: string;
  content: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation?: string;
  source_reference?: SourceReference;
}

export interface Chapter {
  chapter: number;
  chapter_title?: string;
  timeLimit?: number; // Time limit in seconds
  knowledge_map?: {
    topics: string[];
  };
  questions: Question[];
}

export type MemoryLevel = 1 | 2 | 3 | 4;

export interface QuestionProgress {
  questionKey: string;
  chapterId: number;
  questionId: number | string;
  lastLevel: MemoryLevel;
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  consecutiveMastered: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  intervalMinutes: number;
  lastWasWrong: boolean;
}

export interface SRSScheduleSettings {
  level1Minutes: number;
  level2Minutes: number;
  level3Minutes: number;
  level4StartMinutes: number;
  level4MaxMinutes: number;
}

export type SessionMode =
  | 'smart'
  | 'due'
  | 'unmastered'
  | 'wrong'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'level4'
  | 'all';

export interface SavedChapterSession {
  chapterId: number;
  mode: SessionMode;
  modeLabel: string;
  questionIds: (number | string)[];
  initialTotal: number;
  completedCount: number;
  correctInSession: number;
  wrongInSession: number;
  levelCounts: Record<MemoryLevel, number>;
  startedAt: number;
  updatedAt: number;
}

export interface ChapterStats {
  total: number;
  unseen: number;
  unmastered: number;
  mastered: number;
  due: number;
  wrong: number;
  level1: number;
  level2: number;
  level3: number;
  level4: number;
}
