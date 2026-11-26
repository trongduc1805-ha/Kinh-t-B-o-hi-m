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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div 
        className="absolute inset-0 bg-black/45" 
        onClick={onClose}
      />
      <div className="relative w-full max-w-[440px] bg-white border border-zinc-200 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 shrink-0 bg-white">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Dices strokeWidth={2} className="w-4 h-4 text-[#1d4ed8]" />
            <span>Tạo đề thi tùy chỉnh</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={2} className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
          <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white overflow-hidden">
            {chapters.map((chapter) => {
              const count = structure[chapter.chapter] || 0;
              const maxAvailable = chapter.questions?.length || 0;
              return (
                <div 
                  key={chapter.chapter}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      Chương {chapter.chapter}
                    </p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      Kho: {maxAvailable} câu
                    </p>
                  </div>
                  
                  {/* Stepper */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => updateCount(chapter.chapter, -1)}
                      disabled={count <= 0}
                      className="w-8 h-8 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold cursor-pointer text-sm"
                    >
                      -
                    </button>
                    <span className="w-7 text-center text-sm font-bold text-zinc-900 tabular-nums">
                      {count}
                    </span>
                    <button 
                      onClick={() => updateCount(chapter.chapter, 1)}
                      disabled={count >= maxAvailable}
                      className="w-8 h-8 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold cursor-pointer text-sm"
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
        <div className="px-5 py-4 border-t border-zinc-200 bg-white shrink-0 space-y-3 pb-[calc(env(safe-area-inset-bottom,16px)+16px)]">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-zinc-500 font-medium">Tổng câu hỏi:</span>
            <span className="font-bold text-[#1d4ed8] tabular-nums">{totalSelected} câu</span>
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-zinc-500 font-medium">Thời gian làm bài:</span>
            <select 
              value={timeLimitOption}
              onChange={(e) => setTimeLimitOption(Number(e.target.value))}
              className="text-xs sm:text-sm font-semibold text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer focus:border-[#1d4ed8]"
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
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:pointer-events-none"
          >
            Bắt đầu làm bài
          </button>
        </div>
      </div>
    </div>
  );
}
