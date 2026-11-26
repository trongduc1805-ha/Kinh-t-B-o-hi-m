import React from 'react';
import { Chapter } from '../types';
import { ChevronRight } from 'lucide-react';
import { getChapterStats, getSavedSession } from '../utils/srsStorage';

interface Props {
  chapters: Chapter[];
  onSelectChapter: (chapter: Chapter) => void;
  selectedChapter?: Chapter | null;
  progressVersion?: number;
}

export default function ChapterList({
  chapters,
  onSelectChapter,
  selectedChapter,
  progressVersion = 0,
}: Props) {
  const now = Date.now();
  void progressVersion;

  return (
    <nav className="flex flex-col w-full border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white overflow-hidden">
      {chapters.map((chapter) => {
        const isSelected = selectedChapter?.chapter === chapter.chapter;
        const stats = getChapterStats(chapter, now);
        const savedSession = getSavedSession(chapter.chapter);

        return (
          <button
            type="button"
            key={chapter.chapter}
            onClick={() => onSelectChapter(chapter)}
            className={`w-full text-left px-4 py-3.5 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
              isSelected
                ? 'bg-[#1d4ed8] text-white'
                : 'bg-white text-zinc-800 hover:bg-[#eff6ff]/60 active:bg-[#eff6ff]'
            }`}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span
                className={`text-xs sm:text-sm font-semibold leading-snug line-clamp-2 ${
                  isSelected ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {chapter.chapter_title?.replace(/^CHƯƠNG\s*[IVXLCDM\d]+[\s:\-.]*/i, '')}
              </span>
              <span
                className={`text-xs font-medium mt-1 tabular-nums truncate ${
                  isSelected ? 'text-blue-100' : 'text-zinc-500'
                }`}
              >
                Thuộc {stats.mastered}/{stats.total}
                {stats.due > 0 && ` · Đến hạn ${stats.due}`}
                {savedSession && ` · Đang học dở`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-xs font-bold tabular-nums ${
                  isSelected ? 'text-blue-100' : 'text-zinc-400'
                }`}
              >
                {stats.total}
              </span>
              <ChevronRight
                className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-zinc-400'}`}
                strokeWidth={2}
              />
            </div>
          </button>
        );
      })}
      {(!chapters || chapters.length === 0) && (
        <div className="p-6 text-center text-xs font-semibold uppercase text-zinc-500">
          CHƯA CÓ DỮ LIỆU
        </div>
      )}
    </nav>
  );
}

