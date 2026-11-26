import React, { useState, useEffect } from 'react';
import { Chapter, Question } from '../types';
import { X, Dices } from 'lucide-react';

interface Props {
  chapters: Chapter[];
  onStartExam: (examChapter: Chapter) => void;
  onClose: () => void;
}

export default function ExamBuilderModal({ chapters, onStartExam, onClose }: Props) {
  // Default structure: roughly proportional to chapter size, totaling ~60 questions
  const totalTarget = 60;
  const totalAvailable = chapters.reduce((sum, c) => sum + (c.questions?.length || 0), 0);
  
  const [structure, setStructure] = useState<Record<number, number>>({});
  const [timeLimitOption, setTimeLimitOption] = useState<number>(0); // 0 = no limit, otherwise minutes

  useEffect(() => {
    const defaultStruct: Record<number, number> = {};
    let remaining = totalTarget;
    chapters.forEach((c, index) => {
      if (index === chapters.length - 1) {
        defaultStruct[c.chapter] = Math.max(0, Math.min(remaining, c.questions?.length || 0));
      } else {
        const count = Math.min(
          remaining,
          Math.max(1, Math.round(((c.questions?.length || 0) / totalAvailable) * totalTarget)),
          c.questions?.length || 0
        );
        defaultStruct[c.chapter] = count;
        remaining -= count;
      }
    });
    setStructure(defaultStruct);
  }, [chapters]);

  const updateCount = (chapterNumber: number, delta: number) => {
    setStructure(prev => {
      const maxAvailable = chapters.find(c => c.chapter === chapterNumber)?.questions?.length || 0;
      const current = prev[chapterNumber] || 0;
      const next = Math.max(0, Math.min(maxAvailable, current + delta));
      return { ...prev, [chapterNumber]: next };
    });
  };

  const totalSelected = Object.values(structure).reduce((sum: number, count) => sum + (count as number), 0);

  const handleStart = () => {
    let examQuestions: Question[] = [];
    
    chapters.forEach(c => {
      const count = structure[c.chapter] || 0;
      if (count > 0 && c.questions && c.questions.length > 0) {
        // Randomly shuffle and pick 'count' questions
        const shuffled = [...c.questions].sort(() => 0.5 - Math.random());
        examQuestions = [...examQuestions, ...shuffled.slice(0, count)];
      }
    });

    // Shuffle the final combined list
    examQuestions = examQuestions.sort(() => 0.5 - Math.random());

    // Create a virtual chapter for the exam
    const examChapter: Chapter = {
      chapter: 999, // Special ID for exam
      chapter_title: `Đề thi ngẫu nhiên (${examQuestions.length} câu)`,
      timeLimit: timeLimitOption > 0 ? timeLimitOption * 60 : undefined,
      questions: examQuestions
    };

    onStartExam(examChapter);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-[440px] bg-white border-2 border-zinc-300 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-20 duration-300 ease-out p-1">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-6 border-b border-zinc-100 shrink-0 bg-white">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-zinc-900 tracking-wider flex items-center gap-2 uppercase">
              <Dices strokeWidth={2} className="w-5 h-5 text-[#1d4ed8]" />
              Tạo đề thi tùy chỉnh
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 border border-zinc-200 transition-colors cursor-pointer select-none"
          >
            <X strokeWidth={2} className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
          <div className="flex flex-col gap-4">
            {chapters.map((chapter, index) => {
              const count = structure[chapter.chapter] || 0;
              const maxAvailable = chapter.questions?.length || 0;
              return (
                <div 
                  key={chapter.chapter}
                  className="p-4 flex items-center justify-between border-2 border-zinc-300 bg-zinc-50/50 rounded-2xl transition-all hover:border-zinc-400 hover:bg-zinc-50 shadow-sm"
                >
                  <div className="flex-1 pr-4">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-800 leading-tight">
                      Chương {chapter.chapter}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Kho câu hỏi: {maxAvailable} câu
                    </p>
                  </div>
                  
                  {/* Stepper */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => updateCount(chapter.chapter, -1)}
                      disabled={count <= 0}
                      className="w-8 h-8 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold cursor-pointer select-none text-sm shadow-sm"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xs sm:text-sm font-bold text-zinc-800 select-none">
                      {count}
                    </span>
                    <button 
                      onClick={() => updateCount(chapter.chapter, 1)}
                      disabled={count >= maxAvailable}
                      className="w-8 h-8 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold cursor-pointer select-none text-sm shadow-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-100 bg-white z-10 shrink-0 pb-6 relative">
          
          <div className="flex items-center justify-between mb-4 bg-zinc-50/60 p-3 rounded-2xl border-2 border-zinc-300">
            <span className="text-[11px] sm:text-xs text-zinc-500 font-medium">Tổng câu hỏi chọn:</span>
            <span className="text-sm sm:text-base font-bold text-[#1d4ed8] mr-1 tabular-nums">{totalSelected}</span>
          </div>

          <div className="flex items-center justify-between mb-5 bg-zinc-50/60 p-3 rounded-2xl border-2 border-zinc-300">
            <span className="text-[11px] sm:text-xs text-zinc-500 font-medium">Giới hạn thời gian:</span>
            <select 
              value={timeLimitOption}
              onChange={(e) => setTimeLimitOption(Number(e.target.value))}
              className="text-[11px] sm:text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-full px-3 py-1 outline-none cursor-pointer focus:border-[#1d4ed8]/50"
            >
              <option value={0}>Không giới hạn</option>
              <option value={15}>15 phút</option>
              <option value={30}>30 phút</option>
              <option value={45}>45 phút</option>
              <option value={60}>60 phút</option>
              <option value={90}>90 phút</option>
              <option value={120}>120 phút</option>
            </select>
          </div>

          <button
            onClick={handleStart}
            disabled={totalSelected === 0}
            className="btn-primary w-full py-3.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            Bắt Đầu Làm Bài
          </button>
        </div>
      </div>
    </div>
  );
}
