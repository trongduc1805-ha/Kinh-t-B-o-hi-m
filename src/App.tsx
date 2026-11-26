/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import ChapterList from './components/ChapterList';
import ChapterDashboard from './components/ChapterDashboard';
import Quiz from './components/Quiz';
import ExamBuilderModal from './components/ExamBuilderModal';
import { Chapter, SavedChapterSession } from './types';
import questionsData from './data/questions.json';
import { Dices } from 'lucide-react';
import { initGlobalAudioUnlock } from './utils/audioManager';

export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [activeStudySession, setActiveStudySession] = useState<SavedChapterSession | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  const bumpProgress = () => setProgressVersion((v) => v + 1);

  useEffect(() => {
    return initGlobalAudioUnlock();
  }, []);

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

  const handleSelectChapter = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setActiveStudySession(null);
  };

  const handleStartExam = (examChapter: Chapter) => {
    setIsExamModalOpen(false);
    setActiveStudySession(null);
    setSelectedChapter(examChapter);
  };

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-white text-zinc-900">
      <header className="min-h-14 sm:min-h-16 bg-white border-b border-zinc-200 flex items-center px-4 md:px-6 shrink-0 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full py-2">
          <img
            src="/assets/aistudio/visa-and-insurance-svgrepo-com_416f731d.svg"
            alt="Kinh tế bảo hiểm"
            className="h-7 sm:h-9 w-auto object-contain shrink-0"
          />
          <span className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-zinc-900 min-w-0 flex-1 block truncate">
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
                <span className="truncate block font-semibold text-zinc-800">
                  {selectedChapter.chapter_title ? selectedChapter.chapter_title.replace(/^CHƯƠNG\s*[IVXLCDM\d]+[\s:\-.]*/i, '') : ''}
                </span>
              )
            ) : (
              <span className="truncate block font-extrabold tracking-wide uppercase">KINH TẾ BẢO HIỂM</span>
            )}
          </span>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Desktop Sidebar */}
        {(!selectedChapter || (selectedChapter.chapter !== 1000 && selectedChapter.chapter !== 2000)) && (
          <aside className="w-72 lg:w-80 border-r border-zinc-200 p-4 lg:p-5 flex flex-col shrink-0 hidden md:flex overflow-hidden bg-white">
            <div className="mb-4 shrink-0">
              <button 
                onClick={() => setIsExamModalOpen(true)}
                className="btn-primary w-full py-2.5 text-sm"
              >
                <Dices strokeWidth={2} className="w-4 h-4 text-white" />
                <span>Tạo đề thi tùy chỉnh</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <ChapterList 
                chapters={chapters} 
                onSelectChapter={handleSelectChapter} 
                selectedChapter={selectedChapter}
                progressVersion={progressVersion}
              />
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          {selectedChapter ? (
            <div className="flex-1 overflow-y-auto px-0 sm:px-6 lg:px-10 py-2 sm:py-6">
              {selectedChapter.chapter >= 900 || activeStudySession ? (
                <Quiz
                  chapter={selectedChapter}
                  studySession={activeStudySession}
                  onProgressUpdated={bumpProgress}
                  onBack={() => {
                    setActiveStudySession(null);
                    if (selectedChapter.chapter >= 900) {
                      setSelectedChapter(null);
                    }
                    bumpProgress();
                  }}
                />
              ) : (
                <ChapterDashboard
                  chapter={selectedChapter}
                  progressVersion={progressVersion}
                  onProgressChange={bumpProgress}
                  onStartSession={(session) => {
                    bumpProgress();
                    setActiveStudySession(session);
                  }}
                  onBackMobile={() => setSelectedChapter(null)}
                />
              )}
            </div>
          ) : (
            <>
              {/* Mobile Chapter List View */}
              <div className="flex-1 flex flex-col w-full h-full overflow-hidden md:hidden px-4 pt-4">
                <div className="w-full flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,16px)+20px)] space-y-4">
                  <button 
                    onClick={() => setIsExamModalOpen(true)}
                    className="btn-primary w-full py-3"
                  >
                    <Dices strokeWidth={2} className="w-4 h-4 text-white" />
                    <span>Tạo đề thi tùy chỉnh</span>
                  </button>

                  <ChapterList 
                    chapters={chapters} 
                    onSelectChapter={handleSelectChapter} 
                    selectedChapter={selectedChapter}
                    progressVersion={progressVersion}
                  />
                </div>
              </div>
              
              {/* Desktop Empty State */}
              <div className="hidden md:flex flex-1 flex-col items-center justify-center px-8 bg-white text-center">
                <p className="text-sm font-semibold text-zinc-500">
                  Chọn một chương ở danh sách bên trái để bắt đầu ôn tập.
                </p>
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
