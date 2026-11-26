/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import ChapterList from './components/ChapterList';
import Quiz from './components/Quiz';
import ExamBuilderModal from './components/ExamBuilderModal';
import { Chapter } from './types';
import questionsData from './data/questions.json';
import { Dices } from 'lucide-react';

export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  useEffect(() => {
    const rawData = questionsData as any[];

    if (Array.isArray(rawData) && rawData.length > 0 && Array.isArray(rawData[0]?.questions)) {
      const processedChapters: Chapter[] = rawData.map((ch, idx) => {
        const chapterNum = ch.chapter ?? idx + 1;
        return {
          ...ch,
          chapter: chapterNum,
          chapter_title: ch.chapter_title || `CHƯƠNG ${chapterNum}`,
          questions: (ch.questions || []).map((q: any) => ({
            ...q,
            chapterId: q.chapterId ?? chapterNum,
          })),
        };
      });

      setChapters(processedChapters);
      return;
    }

    const ch1Questions: any[] = [];
    const ch2Questions: any[] = [];
    const ch3Questions: any[] = [];
    
    let currentChapter = 1;
    
    rawData.forEach((q, idx) => {
      const qId = q.id;
      if (idx > 0 && qId === 1) {
        currentChapter++;
      }
      
      const processedQuestion = {
        ...q,
        chapterId: currentChapter
      };
      
      if (currentChapter === 1) {
        ch1Questions.push(processedQuestion);
      } else if (currentChapter === 2) {
        ch2Questions.push(processedQuestion);
      } else {
        ch3Questions.push(processedQuestion);
      }
    });
    
    const processedChapters: Chapter[] = [
      {
        chapter: 1,
        chapter_title: "CHƯƠNG I: ĐẢNG CỘNG SẢN VIỆT NAM RA ĐỜI VÀ LÃNH ĐẠO ĐẤU TRANH GIÀNH CHÍNH QUYỀN (1930-1945)",
        questions: ch1Questions
      },
      {
        chapter: 2,
        chapter_title: "CHƯƠNG II: ĐẢNG LÃNH ĐẠO ĐẤU TRANH BẢO VỆ CHÍNH QUYỀN VÀ KHÁNG CHIẾN CHỐNG XÂM LƯỢC (1945-1975)",
        questions: ch2Questions
      },
      {
        chapter: 3,
        chapter_title: "CHƯƠNG III: ĐẢNG LÃNH ĐẠO CẢ NƯỚC QUÁ ĐỘ LÊN CHỦ NGHĨA XA HỘI VÀ TIẾN HÀNH CÔNG CUỘC ĐỔI MỚI (1975-NAY)",
        questions: ch3Questions
      }
    ];
    
    setChapters(processedChapters);
  }, []);

  const handleStartExam = (examChapter: Chapter) => {
    setIsExamModalOpen(false);
    setSelectedChapter(examChapter);
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden max-w-[1440px] mx-auto md:max-w-none relative z-0 bg-white text-zinc-900">
      <header className="h-[80px] md:h-20 bg-white border-b border-zinc-200/80 flex items-center px-4 md:px-8 shrink-0 pt-[env(safe-area-inset-top,16px)] pb-2 relative z-20">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full">
          {/* Logo */}
          <img
            src="/assets/aistudio/visa-and-insurance-svgrepo-com_416f731d.svg"
            alt="Kinh tế bảo hiểm"
            className="h-9 sm:h-10 md:h-11 w-auto object-contain shrink-0"
          />
          <span className="font-bold text-sm sm:text-base md:text-lg lg:text-xl tracking-tight text-zinc-800 mt-0.5 uppercase min-w-0 flex-1 block truncate">
            {selectedChapter ? (
              selectedChapter.chapter === 1000 ? (
                <span className="truncate block">LUYỆN ĐỀ CHUẨN</span>
              ) : selectedChapter.chapter === 2000 ? (
                <span className="truncate block">{selectedChapter.chapter_title?.toUpperCase()}</span>
              ) : selectedChapter.chapter === 999 ? (
                <span className="truncate block">ĐỀ THI NGẪU NHIÊN</span>
              ) : selectedChapter.chapter === 998 ? (
                <span className="truncate block">ÔN LẠI CÂU SAI</span>
              ) : (
                <span className="truncate block text-xs sm:text-sm md:text-base lg:text-lg text-zinc-700 leading-tight font-semibold normal-case">
                  {selectedChapter.chapter_title ? selectedChapter.chapter_title.replace(/^CHƯƠNG\s*[IVXLCDM\d]+[\s:\-.]*/i, '') : ''}
                </span>
              )
            ) : (
              <span className="truncate block tracking-wider font-extrabold text-zinc-900">KINH TẾ BẢO HIỂM</span>
            )}
          </span>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Desktop Sidebar */}
        {(!selectedChapter || (selectedChapter.chapter !== 1000 && selectedChapter.chapter !== 2000)) && (
          <aside className="w-80 lg:w-96 border-r border-zinc-200/60 p-6 lg:p-8 flex flex-col shrink-0 hidden md:flex overflow-hidden relative z-10 bg-white">
            <div className="flex flex-col gap-4 mb-8 shrink-0">
              <button 
                onClick={() => setIsExamModalOpen(true)}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
              >
                <Dices strokeWidth={2} className="w-5 h-5 text-white" />
                <span className="text-sm lg:text-base font-semibold text-white tracking-wide">TẠO ĐỀ THI TÙY CHỈNH</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 -mr-2 scrollbar-hide">
              <ChapterList 
                chapters={chapters} 
                onSelectChapter={setSelectedChapter} 
                selectedChapter={selectedChapter}
              />
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
          {selectedChapter ? (
             <div className="flex-1 overflow-y-auto p-0 sm:p-10 relative">
               <Quiz 
                 chapter={selectedChapter} 
                 onBack={() => setSelectedChapter(null)} 
               />
             </div>
          ) : (
            <>
              {/* Mobile Chapter List View */}
              <div className="flex-1 flex flex-col w-full h-full pt-6 overflow-hidden md:hidden relative z-10 px-4">
                <div className="w-full flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,20px)+20px)]">
                  <div className="mb-8 w-full flex flex-col items-center justify-center relative group px-2">
                    <div className="bg-zinc-50 border-2 border-zinc-300 w-full max-w-sm p-6 rounded-3xl shadow-md">
                      <h3 className="text-base font-bold text-center mb-4 text-zinc-800 tracking-tight">ỦNG HỘ TÁC GIẢ</h3>
                      <div className="border border-zinc-300 p-2 mb-2 bg-zinc-100 rounded-2xl overflow-hidden">
                        <img src="/VietQr-.png?v=1" alt="Donate QR" className="w-full h-auto object-contain rounded-xl" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-4 mb-8 mt-4">
                    <button 
                      onClick={() => setIsExamModalOpen(true)}
                      className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
                    >
                      <Dices strokeWidth={2} className="w-5 h-5 text-white" />
                      <span className="text-sm font-semibold tracking-wide text-white">TẠO ĐỀ THI TÙY CHỈNH</span>
                    </button>
                  </div>
                  
                  <div className="mb-10 space-y-4">
                    <ChapterList 
                      chapters={chapters} 
                      onSelectChapter={setSelectedChapter} 
                      selectedChapter={selectedChapter}
                    />
                  </div>
                </div>
              </div>
              
              {/* Desktop Empty State */}
              <div className="hidden md:flex flex-1 flex-col items-center justify-center relative z-10 px-10 bg-white">
                {/* Decorative background gradients or grid */}
                <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#1d4ed8]/5 blur-[80px] -z-10"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#60a5fa]/10 rounded-full blur-[100px] -z-10"></div>

                <div className="flex flex-col items-center justify-center p-6 w-full max-w-md relative group">
                  <div className="bg-zinc-50 border-2 border-zinc-300 w-full p-8 rounded-3xl shadow-md relative overflow-hidden transition-all duration-300 hover:border-[#93c5fd]">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#1d4ed8]/10 rounded-full blur-2xl"></div>
                    <h3 className="text-lg font-bold text-center mb-6 text-zinc-800 tracking-tight">ỦNG HỘ TÁC GIẢ</h3>
                    <div className="border border-zinc-300 p-3 mb-2 bg-zinc-100 rounded-2xl overflow-hidden shadow-inner">
                      <img src="/VietQr-.png?v=1" alt="Donate QR" className="w-full h-auto object-contain rounded-xl transition-all duration-300 hover:scale-105" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {isExamModalOpen && (
        <ExamBuilderModal 
          chapters={chapters}
          onStartExam={handleStartExam}
          onClose={() => setIsExamModalOpen(false)}
        />
      )}
    </div>
  );
}
