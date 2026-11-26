import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Chapter, MemoryLevel, Question, SavedChapterSession, SessionMode } from '../types';
import { ArrowLeft, RotateCcw, HelpCircle, Check, X, Clock, Volume2, VolumeX, Flame, Music } from 'lucide-react';
import { ContentRenderer } from './ContentRenderer';
import {
  clearChapterSession,
  formatIntervalLabel,
  getQuestionProgress,
  getScheduleSettings,
  previewNextIntervalMinutes,
  recordQuestionReview,
  saveChapterSession,
} from '../utils/srsStorage';
import { playSFX, setAmbientAudioSession, unlockAudio } from '../utils/audioManager';

interface Props {
  chapter: Chapter;
  onBack: () => void;
  studySession?: SavedChapterSession | null;
  onProgressUpdated?: () => void;
}

const shuffleQuestionOptions = (question: Question): Question => {
  if (!question.options || Object.keys(question.options).length === 0) return question;
  
  const entries = Object.entries(question.options);
  const originalKeys = entries.map(e => e[0]).sort();
  const shuffledEntries = [...entries].sort(() => Math.random() - 0.5);
  
  const newOptions: Record<string, string> = {};
  let newCorrectAnswer = question.correct_answer;
  const oldCorrectAnswer = question.correct_answer?.trim().toUpperCase();
  
  shuffledEntries.forEach((entry, index) => {
    const originalKey = entry[0];
    const originalText = entry[1];
    const newKey = originalKeys[index];
    
    newOptions[newKey] = originalText;
    
    if (originalKey.toUpperCase() === oldCorrectAnswer) {
      newCorrectAnswer = newKey;
    }
  });
  
  return {
    ...question,
    options: newOptions,
    correct_answer: newCorrectAnswer
  };
};

interface SessionMetaState {
  mode: SessionMode;
  modeLabel: string;
  initialTotal: number;
  completedCount: number;
  correctInSession: number;
  wrongInSession: number;
  levelCounts: Record<MemoryLevel, number>;
  startedAt: number;
}

const createDefaultSessionMeta = (total: number, studySession?: SavedChapterSession | null): SessionMetaState => ({
  mode: studySession?.mode || 'all',
  modeLabel: studySession?.modeLabel || 'Ôn tập chương',
  initialTotal: studySession?.initialTotal || total,
  completedCount: studySession?.completedCount || 0,
  correctInSession: studySession?.correctInSession || 0,
  wrongInSession: studySession?.wrongInSession || 0,
  levelCounts: studySession?.levelCounts || { 1: 0, 2: 0, 3: 0, 4: 0 },
  startedAt: studySession?.startedAt || Date.now(),
});

export default function Quiz({ chapter, onBack, studySession, onProgressUpdated }: Props) {
  const isAutoExamMode = chapter.chapter === 999;
  const isMockExamMode = chapter.chapter === 1000;
  const isExamMode = isAutoExamMode || isMockExamMode;
  const [mockExamIndex, setMockExamIndex] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // The queue of questions to answer
  const [queue, setQueue] = useState<Question[]>([]);
  // The question currently being displayed
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  
  // The option the user selected (if any)
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  // Whether the selected option is correct
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  
  const [showOtherWays, setShowOtherWays] = useState(false);

  // Parse questions
  const parseQuestionText = (text: string) => {
    if (!text) return { mainQuestion: "", otherWays: null };
    const splitStr = /(?=Cách hỏi\s*\d*:|cách hỏi\s*\d*:)/i;
    const parts = text.split(splitStr);
    if (parts.length > 1) {
      const mainQuestion = parts[0].trim();
      const otherWays = parts.slice(1).map(p => p.trim());
      return { mainQuestion, otherWays };
    }
    return { mainQuestion: text, otherWays: null };
  };

  const { mainQuestion, otherWays } = parseQuestionText(currentQuestion?.content || "");

  useEffect(() => {
    setShowOtherWays(false);
    if (containerRef.current && containerRef.current.parentElement) {
      containerRef.current.parentElement.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentQuestion]);

  // Audio State
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('quiz_isMuted') === 'true';
  });
  const [isSFXMuted, setIsSFXMuted] = useState(() => {
    return localStorage.getItem('quiz_isSFXMuted') === 'true';
  });
  const [volume, setVolume] = useState(0.25);

  useEffect(() => {
    localStorage.setItem('quiz_isMuted', String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('quiz_isSFXMuted', String(isSFXMuted));
  }, [isSFXMuted]);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const feedbackRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const autoAdvanceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Scroll to explanation when answered
  useEffect(() => {
    if (selectedOption && feedbackRef.current && !isExamMode) {
      setTimeout(() => {
        feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [selectedOption, isExamMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Counters & SRS Session State
  const [masteredCount, setMasteredCount] = useState(0);
  const [sessionMeta, setSessionMeta] = useState<SessionMetaState>(() =>
    createDefaultSessionMeta(chapter.questions?.length || 0, studySession)
  );
  const [initialSessionQuestions, setInitialSessionQuestions] = useState<Question[]>([]);
  const requeuedCountsRef = useRef<Map<string, number>>(new Map());
  const totalQuestions = isExamMode ? (chapter.questions?.length || 0) : sessionMeta.initialTotal;

  // Exam and Timer State
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [examWrongQuestions, setExamWrongQuestions] = useState<Question[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(chapter.timeLimit || null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [timeSpent, setTimeSpent] = useState<number>(0);

  // Question Timer State
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<number, number>>({});
  const [currentQuestionStartTime, setCurrentQuestionStartTime] = useState<number>(Date.now());
  const [currentQuestionTimer, setCurrentQuestionTimer] = useState<number>(0);

  // Streak State
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [streakBroken, setStreakBroken] = useState(false);
  const [showStreakPopup, setShowStreakPopup] = useState(false);
  const [streakPopupText, setStreakPopupText] = useState("");

  // Ref for auto-save on exit/unmount
  const latestStateRef = useRef({
    queue: [] as Question[],
    sessionMeta,
    isExamMode,
    chapterId: chapter.chapter,
  });

  useEffect(() => {
    latestStateRef.current = {
      queue,
      sessionMeta,
      isExamMode,
      chapterId: chapter.chapter,
    };
  }, [queue, sessionMeta, isExamMode, chapter.chapter]);

  // Initialize the queue when the chapter or studySession changes
  useEffect(() => {
    requeuedCountsRef.current = new Map();

    let sourceQuestions: Question[] = [];
    if (!isExamMode && studySession && studySession.questionIds.length > 0) {
      const qMap = new Map<string, Question>();
      (chapter.questions || []).forEach((q) => {
        qMap.set(String(q.id), q);
      });
      sourceQuestions = studySession.questionIds
        .map((id) => qMap.get(String(id)))
        .filter((q): q is Question => Boolean(q));
    } else {
      sourceQuestions = chapter.questions || [];
    }

    if (sourceQuestions.length > 0) {
      const initialQueue = sourceQuestions.map(shuffleQuestionOptions);
      setInitialSessionQuestions(sourceQuestions);
      setQueue(initialQueue);
      setCurrentQuestion(initialQueue[0]);
      setSessionMeta(createDefaultSessionMeta(initialQueue.length, studySession));
    } else {
      setInitialSessionQuestions([]);
      setQueue([]);
      setCurrentQuestion(null);
      setSessionMeta(createDefaultSessionMeta(0, studySession));
    }
    setMasteredCount(0);
    setSelectedOption(null);
    setIsCorrect(null);
    
    // Reset Exam/Timer states
    setExamAnswers({});
    setExamWrongQuestions([]);
    setTimeLeft(chapter.timeLimit || null);
    setStartTime(Date.now());
    setTimeSpent(0);
    setQuestionTimeSpent({});
    setCurrentQuestionStartTime(Date.now());
    setCurrentQuestionTimer(0);
    setMockExamIndex(0);
    setIsSubmitted(false);
  }, [chapter, studySession, isExamMode]);

  // Auto-save on page unload or unmount if SRS session still has remaining questions
  useEffect(() => {
    const persistIfActive = () => {
      const { queue: qList, sessionMeta: meta, isExamMode: exam, chapterId } = latestStateRef.current;
      if (!exam && qList.length > 0) {
        saveChapterSession({
          chapterId,
          mode: meta.mode,
          modeLabel: meta.modeLabel,
          questionIds: qList.map((q) => q.id),
          initialTotal: meta.initialTotal,
          completedCount: meta.completedCount,
          correctInSession: meta.correctInSession,
          wrongInSession: meta.wrongInSession,
          levelCounts: meta.levelCounts,
          startedAt: meta.startedAt,
          updatedAt: Date.now(),
        });
      }
    };

    window.addEventListener('beforeunload', persistIfActive);
    return () => {
      window.removeEventListener('beforeunload', persistIfActive);
      persistIfActive();
    };
  }, []);

  const handleBackClick = () => {
    if (!isExamMode && queue.length > 0) {
      saveChapterSession({
        chapterId: chapter.chapter,
        mode: sessionMeta.mode,
        modeLabel: sessionMeta.modeLabel,
        questionIds: queue.map((q) => q.id),
        initialTotal: sessionMeta.initialTotal,
        completedCount: sessionMeta.completedCount,
        correctInSession: sessionMeta.correctInSession,
        wrongInSession: sessionMeta.wrongInSession,
        levelCounts: sessionMeta.levelCounts,
        startedAt: sessionMeta.startedAt,
        updatedAt: Date.now(),
      });
      onProgressUpdated?.();
    }
    onBack();
  };

  // Timer Effect
  useEffect(() => {
    if (isExamMode && timeLeft !== null) {
      if (timeLeft > 0 && queue.length > 0 && currentQuestion) {
        const timer = setInterval(() => setTimeLeft(prev => prev! - 1), 1000);
        return () => clearInterval(timer);
      } else if (timeLeft === 0 && currentQuestion) {
        // Time's up! End exam early.
        if (!isSFXMuted) {
          playSFX('end', volume);
        }
        
        if (isMockExamMode) {
          setIsSubmitted(true);
        } else {
          setExamWrongQuestions(prev => {
            const newWrongs = [...prev];
            queue.forEach(q => {
              if (!newWrongs.find(existing => existing.id === q.id)) {
                newWrongs.push(q);
              }
            });
            return newWrongs;
          });
          setQueue([]);
          setCurrentQuestion(null);
        }
      }
    }
  }, [isExamMode, timeLeft, queue.length, currentQuestion, isMuted, volume]);

  // Current Question Timer Effect
  useEffect(() => {
    setCurrentQuestionStartTime(Date.now());
    setCurrentQuestionTimer(0);
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (currentQuestion && !selectedOption) {
      const timer = setInterval(() => {
        setCurrentQuestionTimer(Math.floor((Date.now() - currentQuestionStartTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentQuestion, selectedOption, currentQuestionStartTime]);

  // Calculate Time Spent when finished
  useEffect(() => {
    if (((!currentQuestion && queue.length === 0) || (isMockExamMode && isSubmitted)) && timeSpent === 0 && totalQuestions > 0) {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
    }
  }, [currentQuestion, queue.length, timeSpent, startTime, totalQuestions, isMockExamMode, isSubmitted]);

  // Handle mock exam submission wrong questions
  useEffect(() => {
    if (isMockExamMode && isSubmitted) {
      const wrong = [];
      let correct = 0;
      queue.forEach(q => {
        const ans = examAnswers[q.id];
        if (!ans || ans.toUpperCase() !== q.correct_answer?.trim().toUpperCase()) {
          wrong.push(q);
        } else {
          correct++;
        }
      });
      setExamWrongQuestions(wrong);
      setMasteredCount(correct);
    }
  }, [isMockExamMode, isSubmitted, queue, examAnswers]);

  const handleNext = (isAnswerCorrect: boolean) => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    if (isMockExamMode) {
      if (mockExamIndex < queue.length - 1) {
        setMockExamIndex(prev => prev + 1);
        setCurrentQuestion(queue[mockExamIndex + 1]);
        setSelectedOption(examAnswers[queue[mockExamIndex + 1].id] || null);
        setIsCorrect(null);
      }
      return;
    }

    setQueue((prevQueue) => {
      const newQueue = [...prevQueue];
      newQueue.shift();

      if (isAnswerCorrect) {
        setMasteredCount((prev) => prev + 1);
      }

      if (newQueue.length > 0) {
        setCurrentQuestion(newQueue[0]);
      } else {
        setCurrentQuestion(null);
      }

      setSelectedOption(null);
      setIsCorrect(null);
      return newQueue;
    });
  };

  const handleRateQuestion = (level: MemoryLevel) => {
    if (!currentQuestion || isCorrect === null || isExamMode) return;

    const effectiveLevel: MemoryLevel = !isCorrect && level > 2 ? 1 : level;
    const qChapterId = currentQuestion.chapterId ?? chapter.chapter;
    recordQuestionReview(qChapterId, currentQuestion.id, effectiveLevel, isCorrect);

    const newQueue = [...queue];
    const currentItem = newQueue.shift();
    const qKey = String(currentQuestion.id);

    if (effectiveLevel === 1 && currentItem) {
      const timesRequeued = requeuedCountsRef.current.get(qKey) || 0;
      const alreadyInQueue = newQueue.some((q) => String(q.id) === qKey);
      if (timesRequeued < 1 && !alreadyInQueue) {
        requeuedCountsRef.current.set(qKey, timesRequeued + 1);
        const shuffledAgain = shuffleQuestionOptions(currentItem);
        const insertIndex = Math.min(3, newQueue.length);
        newQueue.splice(insertIndex, 0, shuffledAgain);
      }
    }

    if (isCorrect) {
      setMasteredCount((prev) => prev + 1);
    }

    const updatedMeta: SessionMetaState = {
      ...sessionMeta,
      completedCount: sessionMeta.completedCount + 1,
      correctInSession: sessionMeta.correctInSession + (isCorrect ? 1 : 0),
      wrongInSession: sessionMeta.wrongInSession + (isCorrect ? 0 : 1),
      levelCounts: {
        ...sessionMeta.levelCounts,
        [effectiveLevel]: (sessionMeta.levelCounts[effectiveLevel] || 0) + 1,
      },
    };
    setSessionMeta(updatedMeta);

    if (newQueue.length > 0) {
      saveChapterSession({
        chapterId: chapter.chapter,
        mode: updatedMeta.mode,
        modeLabel: updatedMeta.modeLabel,
        questionIds: newQueue.map((q) => q.id),
        initialTotal: updatedMeta.initialTotal,
        completedCount: updatedMeta.completedCount,
        correctInSession: updatedMeta.correctInSession,
        wrongInSession: updatedMeta.wrongInSession,
        levelCounts: updatedMeta.levelCounts,
        startedAt: updatedMeta.startedAt,
        updatedAt: Date.now(),
      });
    } else {
      clearChapterSession(chapter.chapter);
    }

    latestStateRef.current = {
      queue: newQueue,
      sessionMeta: updatedMeta,
      isExamMode,
      chapterId: chapter.chapter,
    };

    onProgressUpdated?.();

    setQueue(newQueue);
    setCurrentQuestion(newQueue.length > 0 ? newQueue[0] : null);
    setSelectedOption(null);
    setIsCorrect(null);
  };

  const handleSelectOption = (key: string) => {
    if (!currentQuestion) return;

    unlockAudio();

    // Play background music if not muted and paused (bypasses browser autoplay block on first gesture)
    if (audioRef.current && !isMuted && audioRef.current.paused) {
      setAmbientAudioSession();
      audioRef.current.play().catch(() => {});
    }

    if (isMockExamMode) {
      if (selectedOption === key) {
        // Toggle off
        setSelectedOption(null);
        setExamAnswers(prev => {
          const next = { ...prev };
          delete next[currentQuestion.id];
          return next;
        });
      } else {
        setSelectedOption(key);
        setExamAnswers(prev => ({ ...prev, [currentQuestion.id]: key }));
      }
      return;
    }

    if (selectedOption) return; // Prevent multiple submittions

    setSelectedOption(key);
    
    // Some correct_answer values might have trailing spaces
    const correctKey = currentQuestion.correct_answer?.trim().toUpperCase() || "";
    const isAnswerCorrect = key.toUpperCase() === correctKey;
    
    const timeSpentOnThis = Math.floor((Date.now() - currentQuestionStartTime) / 1000);
    setQuestionTimeSpent(prev => ({
      ...prev,
      [currentQuestion.id]: (prev[currentQuestion.id] || 0) + timeSpentOnThis
    }));

    setIsCorrect(isAnswerCorrect);

      if (isAnswerCorrect) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        setMaxStreak(prev => Math.max(prev, newStreak));
        setStreakBroken(false);
        
        if (newStreak >= 3 && !isExamMode) {
          setShowStreakPopup(true);
          const messages = ["Đang vào guồng! 🔥", "Không thể cản bước! 🚀", "Tuyệt vời! ⭐", "Quá đỉnh! 🌟", "Cháy quá! 💥"];
          setStreakPopupText(messages[(newStreak - 3) % messages.length]);
          setTimeout(() => setShowStreakPopup(false), 2000);
        }
        
        if (!isSFXMuted) {
          if (newStreak > 0 && newStreak % 5 === 0) {
            playSFX('streak5', 1.0);
          } else {
            playSFX('correct', 0.6);
          }
        }
      } else {
        if (streak >= 3) {
          setStreakBroken(true);
        }
        setStreak(0);
        
        if (!isSFXMuted) {
          playSFX('wrong', 1.0);
        }
        
        setExamWrongQuestions(prev => {
          if (!prev.find(q => q.id === currentQuestion.id)) {
            return [...prev, currentQuestion];
          }
          return prev;
        });
      }

      if (isAutoExamMode) {
        setExamAnswers(prev => ({ ...prev, [currentQuestion.id]: key }));
        autoAdvanceTimerRef.current = setTimeout(() => handleNext(isAnswerCorrect), 400);
        return;
      }

      // Record answer for review at the end
      setExamAnswers(prev => {
        if (!prev[currentQuestion.id]) {
          return { ...prev, [currentQuestion.id]: key };
        }
        return prev;
      });
    };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!selectedOption && currentQuestion) {
        const optionKeys = Object.keys(currentQuestion.options || {});
        let keyToSelect: string | null = null;

        if (e.key === 'a' || e.key === 'A' || e.key === '1') keyToSelect = 'A';
        if (e.key === 'b' || e.key === 'B' || e.key === '2') keyToSelect = 'B';
        if (e.key === 'c' || e.key === 'C' || e.key === '3') keyToSelect = 'C';
        if (e.key === 'd' || e.key === 'D' || e.key === '4') keyToSelect = 'D';

        if (keyToSelect && optionKeys.includes(keyToSelect)) {
          handleSelectOption(keyToSelect);
        }
      } else if (isMockExamMode) {
        if (e.key === 'ArrowRight') {
          handleNext(false);
        } else if (e.key === 'ArrowLeft') {
          if (mockExamIndex > 0) {
            setMockExamIndex(prev => prev - 1);
            setCurrentQuestion(queue[mockExamIndex - 1]);
            setSelectedOption(examAnswers[queue[mockExamIndex - 1].id] || null);
            setIsCorrect(null);
          }
        }
      } else if (selectedOption && !isExamMode && isCorrect !== null) {
        if (e.key === '1') handleRateQuestion(1);
        else if (e.key === '2') handleRateQuestion(2);
        else if (e.key === '3' && isCorrect) handleRateQuestion(3);
        else if (e.key === '4' && isCorrect) handleRateQuestion(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestion, selectedOption, isCorrect, isExamMode, queue, sessionMeta]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If there are no questions in this chapter
  const renderQuizContent = () => {
    if (totalQuestions === 0) {
      return (
        <div className="max-w-2xl mx-auto mt-4 w-full px-4">
          <button onClick={onBack} className="mb-4 inline-flex items-center text-zinc-600 hover:text-[#1d4ed8] font-semibold text-sm transition-colors cursor-pointer">
            <ArrowLeft strokeWidth={2} className="w-4 h-4 mr-1" /> Quay lại
          </button>
          <div className="border border-zinc-200 rounded-xl p-8 text-center">
            <p className="text-zinc-700 font-semibold text-sm">Chưa có câu hỏi nào trong phiên này.</p>
          </div>
        </div>
      );
    }

    // If the user has completed all questions
    if ((!currentQuestion && queue.length === 0) || (isMockExamMode && isSubmitted)) {
      const isPerfect = examWrongQuestions.length === 0 && Object.keys(examAnswers).length === totalQuestions;
      
      // Calculate correct score by checking answers
      const correctScore = Object.keys(examAnswers).reduce((acc, qId) => {
        const q = chapter.questions.find(q => q.id.toString() === qId);
        if (q && examAnswers[qId]?.toUpperCase() === q.correct_answer?.trim().toUpperCase()) {
          return acc + 1;
        }
        return acc;
      }, 0);

      // Process longest time consumed questions
      const slowQuestions = chapter.questions
        ?.map(q => ({ ...q, time: questionTimeSpent[q.id] || 0 }))
        .filter(q => q.time > 0)
        .sort((a, b) => b.time - a.time)
        .slice(0, 5) || [];

      return (
        <div className="max-w-2xl mx-auto mt-2 sm:mt-4 w-full px-4 sm:px-0 pb-12">
          <div className="text-center pb-6 border-b border-zinc-200 mb-6">
            <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check strokeWidth={2.5} className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-zinc-900 mb-1">
              {isExamMode ? 'Hoàn thành bài thi' : 'Hoàn thành phiên ôn tập'}
            </h2>
            
            {isExamMode ? (
              <div className="mt-4">
                <p className="font-extrabold text-3xl sm:text-4xl text-[#1d4ed8] tabular-nums">
                  {totalQuestions > 0 ? ((correctScore / totalQuestions) * 10).toFixed(2) : "0.00"} <span className="text-base text-zinc-400">/ 10</span>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold mt-3 tabular-nums">
                  <span className="text-green-600">Đúng: {correctScore}</span>
                  <span className="text-red-600">Sai: {Object.keys(examAnswers).length - correctScore}</span>
                  <span className="text-zinc-500">Bỏ trống: {totalQuestions - Object.keys(examAnswers).length}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs sm:text-sm text-zinc-500 mb-4">
                  {sessionMeta.modeLabel}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-200 border border-zinc-200 rounded-xl overflow-hidden text-left">
                  <div className="p-3 bg-white">
                    <div className="text-[11px] font-medium text-red-700">Mức 1 · Rất khó</div>
                    <div className="text-lg font-extrabold text-red-600 tabular-nums">
                      {sessionMeta.levelCounts[1] || 0}
                    </div>
                  </div>
                  <div className="p-3 bg-white">
                    <div className="text-[11px] font-medium text-amber-700">Mức 2 · Khó</div>
                    <div className="text-lg font-extrabold text-amber-600 tabular-nums">
                      {sessionMeta.levelCounts[2] || 0}
                    </div>
                  </div>
                  <div className="p-3 bg-white">
                    <div className="text-[11px] font-medium text-[#1d4ed8]">Mức 3 · Khá nhớ</div>
                    <div className="text-lg font-extrabold text-[#1d4ed8] tabular-nums">
                      {sessionMeta.levelCounts[3] || 0}
                    </div>
                  </div>
                  <div className="p-3 bg-white">
                    <div className="text-[11px] font-medium text-green-700">Mức 4 · Đã thuộc</div>
                    <div className="text-lg font-extrabold text-green-600 tabular-nums">
                      {sessionMeta.levelCounts[4] || 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 py-4 my-5 border-y border-zinc-200">
              <div>
                <div className="text-[11px] text-zinc-500">Thời gian</div>
                <div className="text-sm sm:text-base font-bold text-zinc-900 inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[#1d4ed8]"/>{formatTime(timeSpent)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">TB / câu</div>
                <div className="text-sm sm:text-base font-bold text-zinc-900 tabular-nums">
                  {totalQuestions > 0 ? (timeSpent / totalQuestions).toFixed(1) : 0}s
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">{isExamMode ? 'Số câu' : 'Chuỗi đúng'}</div>
                <div className="text-sm sm:text-base font-bold text-zinc-900 inline-flex items-center gap-1 tabular-nums">
                  {isExamMode ? totalQuestions : <><Flame className="w-3.5 h-3.5 text-[#1d4ed8]"/>{maxStreak}</>}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button 
                onClick={handleBackClick}
                className="btn-primary w-full sm:w-auto px-5 py-2.5 text-xs font-semibold uppercase tracking-wider"
              >
                {isExamMode ? 'Chọn chương lại' : 'Quay về chương'}
              </button>
              <button 
                onClick={() => {
                  requeuedCountsRef.current = new Map();
                  const restartSource = isExamMode ? chapter.questions : initialSessionQuestions;
                  const initialQueue = restartSource.map(shuffleQuestionOptions);
                  setQueue(initialQueue);
                  setCurrentQuestion(initialQueue[0] || null);
                  setSessionMeta(createDefaultSessionMeta(initialQueue.length, studySession ? {
                    ...studySession,
                    questionIds: restartSource.map((q) => q.id),
                    initialTotal: initialQueue.length,
                    completedCount: 0,
                    correctInSession: 0,
                    wrongInSession: 0,
                    levelCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
                    startedAt: Date.now(),
                  } : null));
                  setMasteredCount(0);
                  setSelectedOption(null);
                  setIsCorrect(null);
                  setExamAnswers({});
                  setExamWrongQuestions([]);
                  setTimeLeft(chapter.timeLimit || null);
                  setStartTime(Date.now());
                  setTimeSpent(0);
                  setStreak(0);
                  setMaxStreak(0);
                  setStreakBroken(false);
                  setMockExamIndex(0);
                  setIsSubmitted(false);
                }}
                className="btn-ghost w-full sm:w-auto px-6 py-2.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <RotateCcw strokeWidth={2} className="w-4 h-4" />
                {isExamMode ? 'LÀM LẠI TỪ ĐẦU' : 'LÀM LẠI PHIÊN NÀY'}
              </button>
            </div>
          </div>

          {/* Display questions for review */}
          {(isExamMode ? chapter.questions : examWrongQuestions)?.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
                {isExamMode ? "Chi tiết bài làm" : `Câu cần xem lại (${examWrongQuestions.length})`}
              </h3>
              <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white overflow-hidden">
                {(isExamMode ? chapter.questions : examWrongQuestions).map((q) => (
                  <div key={q.id} className="p-4 text-text-primary">
                    <div className="text-xs font-bold text-[#1d4ed8] mb-1">Câu {q.id}</div>
                    <p className="font-semibold text-sm mb-3 leading-relaxed text-zinc-900">
                      <ContentRenderer content={q.content.split(/(?=Cách hỏi\s*\d*:|cách hỏi\s*\d*:)/i)[0]} className="inline" />
                    </p>
                    
                    <div className="space-y-1.5">
                      {Object.entries(q.options).map(([key, text]) => {
                        const isSelected = examAnswers[q.id] === key;
                        const isOptCorrect = q.correct_answer === key;
                        
                        let optionClass = "flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs sm:text-sm ";
                        if (isOptCorrect) optionClass += "bg-green-50 border-green-300 text-green-800 font-semibold ";
                        else if (isSelected && !isOptCorrect) optionClass += "bg-red-50 border-red-300 text-red-600 line-through font-semibold ";
                        else optionClass += "bg-white border-zinc-200 text-zinc-500 ";
                        
                        return (
                          <div key={key} className={optionClass}>
                            <span className="font-bold shrink-0">{key}.</span>
                            <span className="flex-1">{String(text)}</span>
                            {isOptCorrect && <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" strokeWidth={2.5}/>}
                            {isSelected && !isOptCorrect && <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" strokeWidth={2.5}/>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 bg-[#eff6ff] border border-[#bfdbfe] p-3 rounded-lg text-xs sm:text-sm text-zinc-800">
                      <ContentRenderer 
                        content={(q.explanation && q.explanation.trim() !== "") 
                          ? q.explanation 
                          : `Đáp án đúng là ${q.correct_answer}.`
                        } 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Display slow questions for review */}
          {slowQuestions.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Các câu làm lâu nhất</h3>
              <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white overflow-hidden">
                {slowQuestions.map((q) => (
                  <div key={q.id} className="p-4 text-text-primary">
                    <div className="flex justify-between items-start gap-3 mb-1.5">
                      <span className="text-xs font-bold text-[#1d4ed8]">Câu {q.id}</span>
                      <span className="text-xs font-semibold text-zinc-500 tabular-nums">{formatTime(q.time)}</span>
                    </div>
                    <p className="font-semibold text-sm text-zinc-900 mb-2">
                      <ContentRenderer content={q.content.split(/(?=Cách hỏi\s*\d*:|cách hỏi\s*\d*:)/i)[0]} className="inline" />
                    </p>
                    <p className="text-xs font-semibold text-green-700">
                      Đáp án đúng: <ContentRenderer content={q.correct_answer} className="inline font-bold" />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`${isMockExamMode && !isSubmitted ? "max-w-6xl flex flex-col md:flex-row md:items-start gap-6" : "max-w-3xl flex flex-col"} mx-auto w-full px-4 sm:px-0 pb-10`}>
          {currentQuestion && !isSubmitted && (
            <>
              {isMockExamMode && (
                <div className="w-full md:w-72 shrink-0 bg-white p-4 border border-zinc-200 md:sticky md:top-4 order-2 md:order-1 mt-4 md:mt-0 xl:max-h-[calc(100vh-6rem)] flex flex-col xl:overflow-hidden rounded-xl">
                  <div className="flex justify-between items-center mb-4 border-b border-zinc-200 pb-3">
                    <p className="font-bold text-zinc-900 text-sm">Danh sách câu hỏi</p>
                    <button 
                      onClick={() => setIsSubmitted(true)}
                      className="btn-primary py-1.5 px-3 text-xs"
                    >
                      Nộp bài
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-2 overflow-y-auto scrollbar-hide pb-2">
                    {queue.map((q, idx) => {
                      const ans = examAnswers[q.id];
                      const isCurrent = idx === mockExamIndex;
                      return (
                        <button
                          key={q.id}
                          onClick={() => {
                            setMockExamIndex(idx);
                            setCurrentQuestion(q);
                            setSelectedOption(examAnswers[q.id] || null);
                            setIsCorrect(null);
                          }}
                          className={`aspect-square border rounded-lg font-semibold flex items-center justify-center transition-colors cursor-pointer select-none text-xs tabular-nums
                            ${isCurrent ? 'bg-[#1d4ed8] text-white border-[#1d4ed8]' : 
                              ans ? 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' : 'bg-zinc-50 border-zinc-200 text-zinc-500'}
                          `}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className={`flex-1 w-full max-w-3xl flex flex-col min-w-0 ${isMockExamMode ? 'order-1 md:order-2' : ''}`}>
              {/* Top Controls Bar */}
              <div className="flex items-center justify-between gap-2 py-2.5 mb-2 border-b border-zinc-100">
                <button onClick={handleBackClick} className="flex items-center text-zinc-600 hover:text-[#1d4ed8] transition-colors cursor-pointer select-none text-xs sm:text-sm font-semibold">
                  <ArrowLeft strokeWidth={2} className="w-4 h-4 mr-1" />
                  <span>Quay lại</span>
                </button>
                <div className="flex items-center gap-2 sm:gap-3 relative">
                  {!isExamMode && (
                    <div className={`flex items-center gap-1 text-xs font-bold tabular-nums ${streak > 0 ? "text-[#1d4ed8]" : "text-zinc-400"}`}>
                      <Flame className="w-4 h-4" />
                      <span>{streak}</span>
                      <AnimatePresence>
                        {showStreakPopup && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: -24 }}
                            exit={{ opacity: 0 }}
                            className="absolute -top-2 right-0 z-50 whitespace-nowrap text-[#1d4ed8] font-bold text-xs pointer-events-none"
                          >
                            {streakPopupText}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  
                  <div className="hidden lg:flex items-center gap-1.5">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                        if (parseFloat(e.target.value) > 0) setIsMuted(false);
                      }}
                      className="w-14 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-[#1d4ed8] outline-none"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const nextMuted = !isMuted;
                      setIsMuted(nextMuted);
                      unlockAudio();
                      if (audioRef.current) {
                        if (nextMuted) {
                          audioRef.current.pause();
                        } else {
                          setAmbientAudioSession();
                          audioRef.current.muted = false;
                          audioRef.current.volume = volume;
                          audioRef.current.play().catch(() => {});
                        }
                      }
                    }}
                    className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer relative"
                    title={isMuted ? "Bật nhạc nền" : "Tắt nhạc nền"}
                  >
                    <Music className={`w-4 h-4 ${isMuted ? "text-zinc-400" : "text-[#1d4ed8]"}`} />
                    {isMuted && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="w-4 h-[1.5px] bg-zinc-400 rotate-45 block" />
                      </span>
                    )}
                  </button>

                  <button 
                    onClick={() => {
                      const nextSFXMuted = !isSFXMuted;
                      setIsSFXMuted(nextSFXMuted);
                      if (!nextSFXMuted) {
                        unlockAudio();
                      }
                    }}
                    className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                    title={isSFXMuted ? "Bật âm hiệu ứng" : "Tắt âm hiệu ứng"}
                  >
                    {isSFXMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-[#1d4ed8]" />}
                  </button>

                  {isExamMode && timeLeft !== null && (
                    <span className="text-xs sm:text-sm font-bold text-[#1d4ed8] tabular-nums">
                      {formatTime(timeLeft)}
                    </span>
                  )}

                  <span className="text-xs sm:text-sm font-semibold text-zinc-500 tabular-nums pl-1 border-l border-zinc-200">
                    {isExamMode ? (
                      <>
                        <strong className="text-zinc-900">{totalQuestions - queue.length + 1}</strong>/{totalQuestions}
                      </>
                    ) : (
                      <>
                        Còn <strong className="text-zinc-900">{queue.length}</strong>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Question Surface (Flat on mobile, minimal 1px border on desktop) */}
              <div className="py-2 sm:p-6 sm:border sm:border-zinc-200 sm:rounded-2xl bg-white text-text-primary">
                <div className="mb-4 sm:mb-5">
                  <div className="text-xs font-bold text-[#1d4ed8] tabular-nums mb-1.5">
                    Câu {currentQuestion.id} &bull; {currentQuestionTimer}s
                  </div>
                  <h1 className="font-semibold text-sm sm:text-base leading-relaxed text-zinc-900">
                    <ContentRenderer content={mainQuestion} className="inline" />
                    {otherWays && (
                      <button 
                        onClick={() => setShowOtherWays(!showOtherWays)}
                        className="inline-flex items-center justify-center ml-1.5 text-zinc-400 hover:text-[#1d4ed8] align-middle cursor-pointer"
                        title="Xem các cách hỏi khác"
                      >
                        <HelpCircle strokeWidth={2} className="w-4 h-4" />
                      </button>
                    )}
                  </h1>
                  
                  {showOtherWays && otherWays && (
                    <div className="mt-3 bg-[#eff6ff] border border-[#bfdbfe] p-3 text-xs sm:text-sm text-zinc-700 rounded-xl">
                      <p className="font-bold mb-1">Các cách hỏi khác:</p>
                      <ul className="space-y-1 list-disc list-inside marker:text-[#1d4ed8]">
                        {otherWays.map((way, idx) => (
                          <li key={idx} className="leading-snug"><ContentRenderer content={way} className="inline" /></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Answer Options */}
                <div className="space-y-2.5">
                  {Object.entries(currentQuestion.options).map(([key, text]) => {
                    if (!text) return null;
                    
                    const isSelected = selectedOption === key;
                    const correctKey = currentQuestion.correct_answer?.trim().toUpperCase();
                    const isCorrectAnswerOption = key.toUpperCase() === correctKey;
                    
                    let buttonClass = "w-full text-left px-3.5 py-3 rounded-xl transition-colors flex items-center gap-3 group cursor-pointer select-none border ";
                    let circleClass = "w-7 h-7 sm:w-8 sm:h-8 border flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 rounded-full ";
                    let textClass = "text-xs sm:text-sm leading-relaxed flex-1 font-medium ";
                    
                    if (selectedOption) {
                      if (isExamMode) {
                        if (isSelected) {
                          buttonClass += "border-[#1d4ed8] bg-[#eff6ff] text-[#1d4ed8]";
                          circleClass += "border-[#1d4ed8] bg-[#1d4ed8] text-white";
                          textClass += "text-zinc-900 font-semibold";
                        } else {
                          buttonClass += "border-zinc-200 opacity-45 pointer-events-none bg-zinc-50";
                          circleClass += "border-zinc-200 text-zinc-400 bg-white";
                          textClass += "text-zinc-400";
                        }
                      } else {
                        if (isSelected && isCorrect) {
                          buttonClass += "border-green-500 bg-green-50 text-green-900";
                          circleClass += "border-green-500 bg-green-500 text-white";
                          textClass += "text-green-900 font-semibold";
                        } else if (isSelected && !isCorrect) {
                          buttonClass += "border-red-500 bg-red-50 text-red-700";
                          circleClass += "border-red-500 bg-red-600 text-white";
                          textClass += "text-red-700 font-semibold";
                        } else if (isCorrectAnswerOption) {
                          buttonClass += "border-green-500 bg-green-50/60 text-green-900";
                          circleClass += "border-green-500 bg-green-500 text-white";
                          textClass += "text-green-900 font-semibold";
                        } else {
                          buttonClass += "border-zinc-200 opacity-45 pointer-events-none bg-zinc-50";
                          circleClass += "border-zinc-200 text-zinc-400 bg-white";
                          textClass += "text-zinc-400";
                        }
                      }
                    } else {
                      buttonClass += "border-zinc-200 bg-white hover:border-[#1d4ed8] hover:bg-[#eff6ff]/40 active:bg-[#eff6ff]";
                      circleClass += "border-zinc-300 text-zinc-600 bg-zinc-50 group-hover:bg-[#1d4ed8] group-hover:text-white group-hover:border-[#1d4ed8]";
                      textClass += "text-zinc-900";
                    }

                    return (
                      <button 
                        key={key} 
                        className={buttonClass}
                        onClick={() => handleSelectOption(key)}
                        disabled={isMockExamMode ? false : !!selectedOption}
                      >
                        <span className={circleClass}>{key}</span>
                        <span className={textClass}>{String(text)}</span>
                        
                        {!isExamMode && selectedOption && isCorrectAnswerOption && (
                          <Check strokeWidth={2.5} className="w-4 h-4 text-green-600 shrink-0 ml-auto" />
                        )}
                        {!isExamMode && selectedOption && isSelected && !isCorrect && (
                          <X strokeWidth={2.5} className="w-4 h-4 text-red-600 shrink-0 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {!isExamMode && selectedOption && (
                  <div className="mt-4 bg-[#eff6ff] border border-[#bfdbfe] p-3.5 sm:p-4 rounded-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">
                        Giải thích
                      </span>
                      {currentQuestion.knowledge_area && (
                        <span className="text-xs text-zinc-500">
                          {currentQuestion.knowledge_area}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm leading-relaxed text-zinc-800">
                      <ContentRenderer 
                        content={(currentQuestion.explanation && currentQuestion.explanation.trim() !== "") 
                          ? currentQuestion.explanation 
                          : `Chưa có giải thích chi tiết cho câu hỏi này. Đáp án đúng là ${currentQuestion.correct_answer}.`
                        } 
                      />
                    </div>
                  </div>
                )}

                <div ref={feedbackRef} />
              </div>

              {/* 4-Level Memory Self-Rating Panel */}
              {!isExamMode && selectedOption && isCorrect !== null && (() => {
                const settings = getScheduleSettings();
                const existingProgress = getQuestionProgress(
                  currentQuestion.chapterId ?? chapter.chapter,
                  currentQuestion.id
                );

                const levels: Array<{
                  level: MemoryLevel;
                  title: string;
                  disabled: boolean;
                  tone: string;
                }> = [
                  {
                    level: 1,
                    title: '1 · Rất khó',
                    disabled: false,
                    tone: 'border-red-300 bg-red-50/70 hover:bg-red-100 text-red-700',
                  },
                  {
                    level: 2,
                    title: '2 · Khó',
                    disabled: false,
                    tone: 'border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-800',
                  },
                  {
                    level: 3,
                    title: '3 · Khá nhớ',
                    disabled: !isCorrect,
                    tone: 'border-[#93c5fd] bg-[#eff6ff] hover:bg-[#dbeafe] text-[#1d4ed8]',
                  },
                  {
                    level: 4,
                    title: '4 · Đã thuộc',
                    disabled: !isCorrect,
                    tone: 'border-green-300 bg-green-50/70 hover:bg-green-100 text-green-700',
                  },
                ];

                return (
                  <div className="mt-4 pt-3.5 border-t border-zinc-200 pb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`font-bold text-xs sm:text-sm ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                        {isCorrect ? 'Đúng' : 'Sai'}
                      </span>
                      <span className="text-xs text-zinc-500">Mức độ nhớ</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {levels.map((item) => {
                        const preview = previewNextIntervalMinutes(
                          existingProgress,
                          item.level,
                          isCorrect,
                          settings
                        );
                        const intervalText =
                          item.level === 1
                            ? `Trong phiên + ${formatIntervalLabel(preview.intervalMinutes)}`
                            : formatIntervalLabel(preview.intervalMinutes);

                        return (
                          <button
                            key={item.level}
                            type="button"
                            disabled={item.disabled}
                            onClick={() => handleRateQuestion(item.level)}
                            className={`text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer select-none ${
                              item.disabled
                                ? 'border-zinc-200 bg-zinc-50 text-zinc-400 opacity-45 cursor-not-allowed'
                                : item.tone
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm whitespace-nowrap">
                              {item.title}
                            </div>
                            <div className="text-[11px] font-semibold mt-0.5 tabular-nums opacity-90">
                              {intervalText}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    );
  };

  const [currentSong] = useState('/Cac-ca-khuc-SnapYT.App.mp3');

  // Synchronize audio with mute/volume state and play background music without interrupting external players
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    audioEl.volume = volume;
    if (isMuted) {
      audioEl.pause();
    } else {
      setAmbientAudioSession();
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Deferred until next user tap in iOS standalone PWA
        });
      }
    }
  }, [isMuted, volume, currentSong]);

  // Handle gestures & app foregrounding (iOS Home Screen PWA & switching back from Spotify)
  useEffect(() => {
    const resumeBgAudioIfEnabled = () => {
      unlockAudio();
      if (audioRef.current && !isMuted && audioRef.current.paused) {
        setAmbientAudioSession();
        audioRef.current.play().catch(() => {});
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resumeBgAudioIfEnabled();
      }
    };

    document.addEventListener('click', resumeBgAudioIfEnabled, { passive: true });
    document.addEventListener('touchstart', resumeBgAudioIfEnabled, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', resumeBgAudioIfEnabled);

    return () => {
      document.removeEventListener('click', resumeBgAudioIfEnabled);
      document.removeEventListener('touchstart', resumeBgAudioIfEnabled);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', resumeBgAudioIfEnabled);
    };
  }, [isMuted]);

  return (
    <>
      <audio
        ref={audioRef}
        src={currentSong}
        loop
        muted={isMuted}
        preload="auto"
        playsInline
        className="hidden"
      />
      {renderQuizContent()}
    </>
  );
}
