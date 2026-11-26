import React from 'react';
import { Chapter } from '../types';
import { ChevronRight } from 'lucide-react';

interface Props {
  chapters: Chapter[];
  onSelectChapter: (chapter: Chapter) => void;
  selectedChapter?: Chapter | null;
}

export default function ChapterList({ chapters, onSelectChapter, selectedChapter }: Props) {
  return (
    <nav className="flex flex-col w-full gap-4">
      {chapters.map((chapter, index) => {
        const isSelected = selectedChapter?.chapter === chapter.chapter;
        return (
          <div 
            key={chapter.chapter}
            onClick={() => onSelectChapter(chapter)}
            className={`px-5 py-4 cursor-pointer flex items-center justify-between transition-all border-2 rounded-2xl ${
              isSelected 
                ? 'bg-[#1d4ed8] text-white border-[#1d4ed8] shadow-lg shadow-[#1d4ed8]/20 -translate-y-0.5' 
                : 'bg-zinc-50/50 border-zinc-300 text-zinc-700 hover:bg-[#eff6ff]/50 hover:text-zinc-900 hover:-translate-y-0.5 hover:border-[#93c5fd] shadow-sm'
            }`}
          >
            <div className="flex items-center gap-4">
              <span className={`text-xs sm:text-sm font-semibold uppercase tracking-wider line-clamp-2 leading-snug ${isSelected ? 'text-white' : 'text-zinc-750'}`}>
                {chapter.chapter_title?.replace(/^CHƯƠNG\s*[IVXLCDM\d]+[\s:\-.]*/i, '')}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className={`flex items-center justify-center min-w-[36px] h-8 rounded-full border px-2 tabular-nums ${
                isSelected 
                  ? 'bg-white border-transparent text-[#1d4ed8] font-bold' 
                  : 'bg-zinc-100/80 border-zinc-200 text-zinc-500 font-bold'
              }`}>
                <span className="text-xs">
                  {chapter.questions?.length || 0}
                </span>
              </div>
              <ChevronRight className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-zinc-400'}`} strokeWidth={2} />
            </div>
          </div>
        );
      })}
      {(!chapters || chapters.length === 0) && (
        <div className="p-8 text-center text-sm font-semibold uppercase border border-zinc-200 bg-zinc-50 rounded-2xl text-zinc-500">
          CHƯA CÓ DỮ LIỆU
        </div>
      )}
    </nav>
  );
}

