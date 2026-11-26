import React, { useState, useEffect, useMemo } from 'react';
import {
  Chapter,
  SavedChapterSession,
  SessionMode,
  SRSScheduleSettings,
} from '../types';
import {
  buildSessionQuestions,
  clearChapterSession,
  DEFAULT_SCHEDULE_SETTINGS,
  getChapterStats,
  getSavedSession,
  getScheduleSettings,
  getSessionModeLabel,
  resetChapterProgress,
  resetScheduleSettings,
  saveChapterSession,
  saveScheduleSettings,
} from '../utils/srsStorage';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

interface Props {
  chapter: Chapter;
  onStartSession: (session: SavedChapterSession) => void;
  onBackMobile: () => void;
  progressVersion: number;
  onProgressChange: () => void;
}

const NEW_LIMIT_OPTIONS = [
  { value: 0, label: '0' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: -1, label: 'Tất cả' },
];

export default function ChapterDashboard({
  chapter,
  onStartSession,
  onBackMobile,
  progressVersion,
  onProgressChange,
}: Props) {
  const [newLimit, setNewLimit] = useState<number>(10);
  const [now, setNow] = useState<number>(() => Date.now());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confirmResetChapter, setConfirmResetChapter] = useState(false);

  const [draftSettings, setDraftSettings] = useState<SRSScheduleSettings>(() =>
    getScheduleSettings()
  );

  useEffect(() => {
    setConfirmResetChapter(false);
    setNow(Date.now());
  }, [chapter.chapter, progressVersion]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(
    () => getChapterStats(chapter, now),
    [chapter, now, progressVersion]
  );

  const savedSession = useMemo(
    () => getSavedSession(chapter.chapter),
    [chapter.chapter, progressVersion]
  );

  const smartQuestions = useMemo(
    () => buildSessionQuestions(chapter, 'smart', newLimit, now),
    [chapter, newLimit, now, progressVersion]
  );

  const smartBreakdown = useMemo(() => {
    const onlyPriority = buildSessionQuestions(chapter, 'smart', 0, now);
    const priorityCount = onlyPriority.length;
    const newCount = Math.max(0, smartQuestions.length - priorityCount);
    return { priorityCount, newCount, total: smartQuestions.length };
  }, [chapter, smartQuestions, now, progressVersion]);

  const cleanChapterTitle =
    chapter.chapter_title?.replace(/^CHƯƠNG\s*[IVXLCDM\d]+[\s:\-.]*/i, '') ||
    `Chương ${chapter.chapter}`;

  const launchMode = (mode: SessionMode, customLimit = newLimit) => {
    const questions = buildSessionQuestions(chapter, mode, customLimit, Date.now());
    if (questions.length === 0) return;

    const session: SavedChapterSession = {
      chapterId: chapter.chapter,
      mode,
      modeLabel: getSessionModeLabel(mode),
      questionIds: questions.map((q) => q.id),
      initialTotal: questions.length,
      completedCount: 0,
      correctInSession: 0,
      wrongInSession: 0,
      levelCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveChapterSession(session);
    onProgressChange();
    onStartSession(session);
  };

  const handleDiscardSavedSession = () => {
    clearChapterSession(chapter.chapter);
    onProgressChange();
  };

  const handleOpenSettings = () => {
    setDraftSettings(getScheduleSettings());
    setIsSettingsOpen(true);
  };

  const handleApplyPreset = (preset: 'urgent' | 'cram' | 'relaxed') => {
    if (preset === 'urgent') {
      setDraftSettings({
        level1Minutes: 3,
        level2Minutes: 10,
        level3Minutes: 30,
        level4StartMinutes: 60,
        level4MaxMinutes: 180,
      });
    } else if (preset === 'cram') {
      setDraftSettings({
        level1Minutes: 1,
        level2Minutes: 5,
        level3Minutes: 15,
        level4StartMinutes: 30,
        level4MaxMinutes: 60,
      });
    } else {
      setDraftSettings({
        level1Minutes: 5,
        level2Minutes: 15,
        level3Minutes: 45,
        level4StartMinutes: 120,
        level4MaxMinutes: 360,
      });
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveScheduleSettings(draftSettings);
    setIsSettingsOpen(false);
    onProgressChange();
  };

  const handleResetSettings = () => {
    const defaults = resetScheduleSettings();
    setDraftSettings(defaults);
    onProgressChange();
  };

  const handleConfirmResetChapter = () => {
    resetChapterProgress(chapter.chapter);
    setConfirmResetChapter(false);
    onProgressChange();
  };

  const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const unmasteredPct = stats.total > 0 ? Math.round((stats.unmastered / stats.total) * 100) : 0;

  const filterModes: Array<{
    mode: SessionMode;
    title: string;
    count: number;
    tone: 'blue' | 'amber' | 'red' | 'green' | 'neutral';
  }> = [
    { mode: 'due', title: 'Câu đến hạn ôn', count: stats.due, tone: 'blue' },
    { mode: 'unmastered', title: 'Câu chưa thuộc', count: stats.unmastered, tone: 'amber' },
    { mode: 'wrong', title: 'Câu trả lời sai', count: stats.wrong, tone: 'red' },
    { mode: 'all', title: 'Toàn bộ chương', count: stats.total, tone: 'neutral' },
    { mode: 'level1', title: 'Mức 1 · Rất khó', count: stats.level1, tone: 'red' },
    { mode: 'level2', title: 'Mức 2 · Khó', count: stats.level2, tone: 'amber' },
    { mode: 'level3', title: 'Mức 3 · Khá nhớ', count: stats.level3, tone: 'blue' },
    { mode: 'level4', title: 'Mức 4 · Đã thuộc', count: stats.level4, tone: 'green' },
  ];

  const toneCountClasses: Record<string, string> = {
    blue: 'text-[#1d4ed8]',
    amber: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600',
    neutral: 'text-zinc-900',
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-2 py-2 pb-14">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={onBackMobile}
          className="md:hidden inline-flex items-center text-zinc-600 hover:text-[#1d4ed8] font-semibold text-xs py-1 cursor-pointer"
        >
          <ArrowLeft strokeWidth={2} className="w-4 h-4 mr-1" />
          Danh sách chương
        </button>

        <span className="hidden md:inline text-xs font-semibold text-zinc-400">
          Chương {chapter.chapter}
        </span>

        <button
          type="button"
          onClick={handleOpenSettings}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d4ed8] hover:underline py-1 cursor-pointer ml-auto whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Lịch ôn</span>
        </button>
      </div>

      {/* Title */}
      <h1 className="text-lg sm:text-2xl font-extrabold text-zinc-900 tracking-tight leading-snug mb-4">
        {cleanChapterTitle}
      </h1>

      {/* Resume Interrupted Session */}
      {savedSession && (
        <div className="mb-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1d4ed8] truncate">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{savedSession.modeLabel}</span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5 tabular-nums">
              Còn <strong className="text-zinc-900">{savedSession.questionIds.length}</strong> / {savedSession.initialTotal} câu
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscardSavedSession}
              className="btn-ghost px-3 py-2 text-xs"
            >
              Bỏ
            </button>
            <button
              type="button"
              onClick={() => onStartSession(savedSession)}
              className="btn-primary px-4 py-2 text-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tiếp tục</span>
            </button>
          </div>
        </div>
      )}

      {/* Unboxed 5-Metric Progress Strip */}
      <div className="py-4 border-y border-zinc-200">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-3 gap-x-2 mb-3">
          <div>
            <div className="text-[11px] font-medium text-zinc-500">Tổng câu</div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tabular-nums">{stats.total}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-500">Chưa học</div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-500 tabular-nums">{stats.unseen}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-amber-700">Chưa thuộc</div>
            <div className="text-lg sm:text-xl font-extrabold text-amber-600 tabular-nums">{stats.unmastered}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-green-700">Đã thuộc</div>
            <div className="text-lg sm:text-xl font-extrabold text-green-600 tabular-nums">{stats.mastered}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-[#1d4ed8]">Đến hạn ôn</div>
            <div className="text-lg sm:text-xl font-extrabold text-[#1d4ed8] tabular-nums">{stats.due}</div>
          </div>
        </div>

        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 transition-all duration-300" style={{ width: `${masteredPct}%` }} />
          <div
            className="bg-[#1d4ed8] transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100 - masteredPct, unmasteredPct))}%` }}
          />
        </div>
      </div>

      {/* Flat Smart Session Section */}
      <div className="py-4 border-b border-zinc-200">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-sm font-bold text-zinc-900">Phiên ôn ưu tiên</span>
          <span className="text-xs text-zinc-500 tabular-nums">
            {smartBreakdown.priorityCount} ôn + {smartBreakdown.newCount} mới
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 mb-3">
          <span className="text-xs text-zinc-500 shrink-0 mr-1">Câu mới:</span>
          {NEW_LIMIT_OPTIONS.map((opt) => {
            const active = newLimit === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setNewLimit(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap tabular-nums shrink-0 ${
                  active
                    ? 'bg-[#1d4ed8] text-white border-[#1d4ed8]'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={smartBreakdown.total === 0}
          onClick={() => launchMode('smart', newLimit)}
          className="btn-primary w-full py-3 text-sm disabled:opacity-45 disabled:pointer-events-none"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>
            {smartBreakdown.total > 0
              ? `Bắt đầu ôn (${smartBreakdown.total} câu)`
              : 'Chưa có câu đến hạn'}
          </span>
        </button>
      </div>

      {/* Clean Filter List */}
      <div className="py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-200 border border-zinc-200 rounded-xl overflow-hidden">
          {filterModes.map((item) => {
            const disabled = item.count === 0;
            return (
              <button
                key={item.mode}
                type="button"
                disabled={disabled}
                onClick={() => launchMode(item.mode)}
                className={`bg-white text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                  disabled
                    ? 'opacity-45 cursor-not-allowed'
                    : 'hover:bg-[#eff6ff]/60 active:bg-[#eff6ff] cursor-pointer'
                }`}
              >
                <span className="text-sm font-semibold text-zinc-900 truncate">{item.title}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-sm font-extrabold tabular-nums ${
                      disabled ? 'text-zinc-400' : toneCountClasses[item.tone]
                    }`}
                  >
                    {item.count}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Chapter Progress */}
      <div className="pt-2">
        {!confirmResetChapter ? (
          <button
            type="button"
            onClick={() => setConfirmResetChapter(true)}
            className="text-xs font-medium text-zinc-400 hover:text-red-600 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Đặt lại tiến độ chương</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-red-600">
              Xóa tiến độ chương {chapter.chapter}?
            </span>
            <button
              type="button"
              onClick={handleConfirmResetChapter}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetChapter(false)}
              className="px-3 py-1 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
            >
              Hủy
            </button>
          </div>
        )}
      </div>

      {/* Schedule Settings Modal (all in minutes) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-zinc-200 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-zinc-900">Lịch hỏi lại (theo phút)</h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                type="button"
                onClick={() => handleApplyPreset('cram')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-700 border border-zinc-200 cursor-pointer"
              >
                Siêu tốc (1–60p)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('urgent')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] cursor-pointer"
              >
                Gấp (3–180p)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('relaxed')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-700 border border-zinc-200 cursor-pointer"
              >
                Vừa (5–360p)
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mức 1 (phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={draftSettings.level1Minutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        level1Minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-[#1d4ed8] outline-none text-sm font-semibold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mức 2 (phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={draftSettings.level2Minutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        level2Minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-[#1d4ed8] outline-none text-sm font-semibold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mức 3 (phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={draftSettings.level3Minutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        level3Minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-[#1d4ed8] outline-none text-sm font-semibold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mức 4 đầu (phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={draftSettings.level4StartMinutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        level4StartMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-[#1d4ed8] outline-none text-sm font-semibold tabular-nums"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mức 4 tối đa (phút) — mặc định {DEFAULT_SCHEDULE_SETTINGS.level4MaxMinutes} phút
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={2880}
                    value={draftSettings.level4MaxMinutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        level4MaxMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-[#1d4ed8] outline-none text-sm font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Mặc định</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="btn-ghost px-3.5 py-2 text-xs"
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn-primary px-4 py-2 text-xs">
                    Lưu lịch
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
