import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Chapter, Question } from '../types';
import { ArrowLeft, CheckCircle2, XCircle, RotateCcw, HelpCircle, Check, X, Clock, Target, Volume2, VolumeX, Flame, Music } from 'lucide-react';
import { ContentRenderer } from './ContentRenderer';

interface Props {
  chapter: Chapter;
  onBack: () => void;
}

const LOCAL_STORAGE_KEY = 'anki_wrong_questions';

const addWrongQuestion = (q: Question) => {
  try {
    const current = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    if (!current.find((item: Question) => item.chapterId === q.chapterId && item.id === q.id)) {
      current.push(q);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.error(e);
  }
};

const removeWrongQuestion = (q: Question) => {
  try {
    const current = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const filtered = current.filter((item: Question) => !(item.chapterId === q.chapterId && item.id === q.id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error(e);
  }
};

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

export default function Quiz({ chapter, onBack }: Props) {
  const isAutoExamMode = chapter.chapter === 999;
  const isMockExamMode = chapter.chapter === 1000;
  const isExamMode = isAutoExamMode || isMockExamMode;
  const isReviewMode = chapter.chapter === 998;
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
  const correctAudioRef = React.useRef<HTMLAudioElement>(null);
  const wrongAudioRef = React.useRef<HTMLAudioElement>(null);
  const endAudioRef = React.useRef<HTMLAudioElement>(null);
  const streak5AudioRef = React.useRef<HTMLAudioElement>(null);

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

  // Counters for progress
  const [masteredCount, setMasteredCount] = useState(0);
  const totalQuestions = chapter.questions?.length || 0;

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

  // Initialize the queue when the chapter changes
  useEffect(() => {
    if (chapter.questions && chapter.questions.length > 0) {
      const initialQueue = chapter.questions.map(shuffleQuestionOptions);
      setQueue(initialQueue);
      setCurrentQuestion(initialQueue[0]);
    } else {
      setQueue([]);
      setCurrentQuestion(null);
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
  }, [chapter]);

  // Timer Effect
  useEffect(() => {
    if (isExamMode && timeLeft !== null) {
      if (timeLeft > 0 && queue.length > 0 && currentQuestion) {
        const timer = setInterval(() => setTimeLeft(prev => prev! - 1), 1000);
        return () => clearInterval(timer);
      } else if (timeLeft === 0 && currentQuestion) {
        // Time's up! End exam early.
        if (endAudioRef.current && !isSFXMuted) {
          endAudioRef.current.volume = volume;
          endAudioRef.current.currentTime = 0;
          endAudioRef.current.play().catch(e => console.error("Audio play error", e));
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
      let newQueue = [...prevQueue];
      
      // Remove the current question from the front of the queue
      newQueue.shift();

      if (isAnswerCorrect) {
        setMasteredCount((prev) => prev + 1);
      } else {
        if (!isExamMode && currentQuestion) {
          // Lặp lại ngắt quãng: Add it multiple times to reinforce learning if wrong
          const shuffledAgain = shuffleQuestionOptions(currentQuestion);
          const insertIndex1 = Math.min(2, newQueue.length);
          newQueue.splice(insertIndex1, 0, shuffledAgain);
          
          if (newQueue.length > 3) {
            const insertIndex2 = Math.min(6, newQueue.length);
            const shuffledAgain2 = shuffleQuestionOptions(currentQuestion);
            newQueue.splice(insertIndex2, 0, shuffledAgain2);
          }
        }
      }

      // Set next question
      if (newQueue.length > 0) {
        setCurrentQuestion(newQueue[0]);
      } else {
        setCurrentQuestion(null);
      }
      
      // Reset states for the next question
      setSelectedOption(null);
      setIsCorrect(null);
      return newQueue;
    });
  };

  const handleSelectOption = (key: string) => {
    if (!currentQuestion) return;
    
    // Play background music if not muted and paused (bypasses browser autoplay block on first gesture)
    if (audioRef.current && !isMuted && audioRef.current.paused) {
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
      
      {
        let audioEl = correctAudioRef.current;
        let playVolume = 0.5;
        if (newStreak > 0 && newStreak % 5 === 0 && streak5AudioRef.current) {
          audioEl = streak5AudioRef.current;
          playVolume = 1.0;
        }
        
        if (audioEl && !isSFXMuted) {
          audioEl.volume = playVolume;
          audioEl.playbackRate = 1.0;
          audioEl.preservesPitch = true;
          audioEl.currentTime = 0;
          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              // Ignore NotSupportedError which happens with empty/missing audio files
              if (e.name !== 'NotSupportedError') {
                console.error("Audio play error", e);
              }
            });
          }
        }
      }
      
      if (isReviewMode) {
        removeWrongQuestion(currentQuestion);
      }
    } else {
      if (streak >= 3) {
        setStreakBroken(true);
      }
      setStreak(0);
      
      {
        let audioEl = wrongAudioRef.current;
        
        if (audioEl && !isSFXMuted) {
          audioEl.volume = 1.0;
          audioEl.playbackRate = 1.0;
          audioEl.currentTime = 0;
          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              if (e.name !== 'NotSupportedError') {
                console.error("Audio play error", e);
              }
            });
          }
        }
      }
      
      addWrongQuestion(currentQuestion);
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

    // Không tự động chuyển câu khi chưa quá 20s để người học có thời gian đọc giải thích
    if (timeSpentOnThis < 20) {
      return;
    }

    // Auto advance with delay to ponder
    const hasRealExplanation = currentQuestion.explanation && currentQuestion.explanation.trim() !== "";
    const delay = hasRealExplanation ? 6000 : (isAnswerCorrect ? 2500 : 4000); 
    autoAdvanceTimerRef.current = setTimeout(() => {
      handleNext(isAnswerCorrect);
    }, delay);
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if a modifier is pressed (ctrl, cmd, alt, shift)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      // Prevent handling if typing in an input
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
        if (e.key === 'Enter' || e.key === ' ') {
          // Prevent default scrolling for space
          if (e.key === ' ') e.preventDefault();
          handleNext(isCorrect);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestion, selectedOption, isCorrect, isExamMode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If there are no questions in this chapter
  const renderQuizContent = () => {
    if (totalQuestions === 0) {
      return (
        <div className="max-w-2xl mx-auto mt-8 w-full px-5">
          <button onClick={onBack} className="mb-6 inline-flex items-center text-zinc-500 hover:text-[#1d4ed8] font-semibold transition-colors group z-20 relative cursor-pointer select-none">
            <ArrowLeft strokeWidth={2} className="w-5 h-5 mr-1.5 group-hover:-translate-x-1 transition-transform" /> QUAY LẠI
          </button>
          <div className="bg-zinc-50 border-2 border-zinc-300 w-full p-12 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm">
            <p className="text-zinc-700 font-bold uppercase text-lg tracking-wider">CHƯƠNG NÀY CHƯA CÓ CÂU HỎI NÀO</p>
            <span className="text-[#1d4ed8] text-2xl mt-4">¯\_(ツ)_/¯</span>
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
        <div className="max-w-2xl mx-auto mt-8 w-full px-5">
          <div className="bg-zinc-50 border-2 border-zinc-300 rounded-3xl p-8 sm:p-10 text-center relative mb-8 overflow-hidden shadow-md">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#1d4ed8]/5 rounded-full blur-2xl"></div>
            
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check strokeWidth={3} className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-zinc-800 mb-6">HOÀN THÀNH BÀI THI</h2>
            
            {isExamMode && (
              <div className="mb-8 p-6 rounded-2xl border-2 border-zinc-300 bg-zinc-50/60">
                <p className="font-extrabold text-4xl sm:text-5xl text-[#1d4ed8] mb-2 tabular-nums">
                  {totalQuestions > 0 ? ((correctScore / totalQuestions) * 10).toFixed(2) : "0.00"} <span className="text-xl text-zinc-400">/ 10</span>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold mt-4">
                  <span className="bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full">ĐÚNG: {correctScore}</span>
                  <span className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-full">SAI: {Object.keys(examAnswers).length - correctScore}</span>
                  <span className="bg-zinc-100 text-zinc-500 border border-zinc-200 px-3 py-1 rounded-full">BỎ TRỐNG: {totalQuestions - Object.keys(examAnswers).length}</span>
                </div>
              </div>
            )}

            {!isExamMode && (
               <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-8 text-zinc-500">BẠN ĐÃ HOÀN THÀNH TẤT CẢ CÂU HỎI.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-zinc-50/60 border-2 border-zinc-300 p-4 rounded-2xl flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase mb-1">THỜI GIAN</span>
                <span className="text-base font-bold text-zinc-800 flex items-center gap-1.5 tabular-nums"><Clock className="w-4 h-4 text-[#60a5fa]"/>{formatTime(timeSpent)}</span>
              </div>
              <div className="bg-zinc-50/60 border-2 border-zinc-300 p-4 rounded-2xl flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase mb-1">TRUNG BÌNH / CÂU</span>
                <span className="text-base font-bold text-zinc-800 tabular-nums">{totalQuestions > 0 ? (timeSpent / totalQuestions).toFixed(1) : 0}s</span>
              </div>
              {!isExamMode && (
                <div className="bg-zinc-50/60 border-2 border-zinc-300 p-4 rounded-2xl flex flex-col items-center">
                  <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase mb-1">CHUỖI TỐT NHẤT</span>
                  <span className="text-base font-bold text-zinc-800 flex items-center gap-1.5 tabular-nums"><Flame className="w-4 h-4 text-[#1d4ed8]"/>{maxStreak}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={onBack}
                className="btn-ghost w-full sm:w-auto px-6 py-2.5 text-xs font-semibold uppercase tracking-wider"
              >
                CHỌN CHƯƠNG LẠI
              </button>
              <button 
                onClick={() => {
                  // Restart
                  const initialQueue = chapter.questions.map(shuffleQuestionOptions);
                  setQueue(initialQueue);
                  setCurrentQuestion(initialQueue[0]);
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
                className="btn-primary w-full sm:w-auto px-6 py-2.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <RotateCcw strokeWidth={2} className="w-4 h-4" />
                LÀM LẠI TỪ ĐẦU
              </button>
            </div>
          </div>

          {/* Display questions for review */}
          {(isExamMode ? chapter.questions : examWrongQuestions)?.length > 0 && (
            <div className="mb-16 mt-12">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 pb-2 border-b border-zinc-200">
                {isExamMode ? "CHI TIẾT BÀI LÀM" : `CÂU CẦN XEM LẠI (${examWrongQuestions.length})`}
              </h3>
              <div className="space-y-6">
                {(isExamMode ? chapter.questions : examWrongQuestions).map((q, idx) => (
                  <div key={q.id} className="bg-white border-2 border-zinc-300 rounded-3xl p-6 shadow-md text-text-primary">
                    <p className="font-bold text-sm sm:text-base mb-4 leading-relaxed text-text-primary flex items-start gap-2">
                      <span className="bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider align-middle shrink-0">Q{q.id}</span> 
                      <span className="flex-1 text-zinc-900 pt-0.5"><ContentRenderer content={q.content.split(/(?=Cách hỏi\s*\d*:|cách hỏi\s*\d*:)/i)[0]} className="inline" /></span>
                    </p>
                    
                    <div className="space-y-3 mt-4 p-4 rounded-2xl bg-[#eff6ff]/40 border-2 border-zinc-200">
                      <div className="flex flex-col gap-2">
                        {Object.entries(q.options).map(([key, text]) => {
                          const isSelected = examAnswers[q.id] === key;
                          const isCorrect = q.correct_answer === key;
                          
                          let optionClass = "flex items-start gap-3 p-3 rounded-xl border-2 text-xs sm:text-sm ";
                          if (isCorrect) optionClass += "bg-green-50 border-green-300 text-green-800 font-semibold ";
                          else if (isSelected && !isCorrect) optionClass += "bg-red-50 border-red-300 text-red-600 line-through font-semibold ";
                          else optionClass += "bg-white border-zinc-300 text-zinc-400 opacity-85 ";
                          
                          return (
                            <div key={key} className={optionClass}>
                              <span className="font-bold shrink-0 w-6">{key}.</span>
                              <span className="flex-1">{String(text)}</span>
                              {isCorrect && <Check className="w-4 h-4 text-green-600 inline shrink-0 mt-0.5" strokeWidth={3.5}/>}
                              {isSelected && !isCorrect && <X className="w-4 h-4 text-red-600 inline shrink-0 mt-0.5" strokeWidth={3.5}/>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 bg-white p-4 border-2 border-zinc-300 rounded-xl text-xs sm:text-sm font-medium text-text-primary shadow-sm">
                        <p className="font-bold uppercase tracking-wider mb-2 text-[10px] text-zinc-400">GIẢI THÍCH:</p>
                        <ContentRenderer 
                          content={(q.explanation && q.explanation.trim() !== "") 
                            ? q.explanation 
                            : `Chưa có giải thích chi tiết cho câu hỏi này. Đáp án đúng là ${q.correct_answer}. Bạn hãy ôn tập thêm trong Giáo trình Kinh tế bảo hiểm.`
                          } 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Display slow questions for review */}
          {slowQuestions.length > 0 && (
            <div className="mb-16 mt-12">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 pb-2 border-b border-zinc-200">CÁC CÂU TỐN NHIỀU THỜI GIAN NHẤT</h3>
              <div className="space-y-6">
                {slowQuestions.map((q, idx) => (
                  <div key={q.id} className="bg-white border-2 border-zinc-300 rounded-3xl p-6 shadow-md text-text-primary">
                    <div className="flex justify-between items-start mb-4 gap-4">
                      <p className="font-bold text-sm sm:text-base leading-relaxed text-text-primary flex items-start gap-2">
                        <span className="bg-zinc-100 text-zinc-800 border-2 border-zinc-300 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider align-middle shrink-0">
                          Q{q.id}
                        </span> 
                        <span className="flex-1 text-zinc-900 pt-0.5"><ContentRenderer content={q.content.split(/(?=Cách hỏi\s*\d*:|cách hỏi\s*\d*:)/i)[0]} className="inline" /></span>
                      </p>
                      <div className="shrink-0 font-semibold text-xs bg-zinc-100 border-2 border-zinc-300 px-3 py-1 text-zinc-800 rounded-full">
                        {formatTime(q.time)}
                      </div>
                    </div>
                    
                    <div className="p-4 rounded-xl bg-green-50 border-2 border-green-200">
                      <p className="font-bold text-xs sm:text-sm text-green-900 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600 inline shrink-0" strokeWidth={3}/>
                        <span>ĐÁP ÁN ĐÚNG:</span>
                        <ContentRenderer content={q.correct_answer} className="inline font-bold" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`${isMockExamMode && !isSubmitted ? "max-w-6xl flex flex-col md:flex-row md:items-start gap-8" : "max-w-3xl flex flex-col"} mx-auto w-full px-4 sm:px-0`}>
          {currentQuestion && !isSubmitted && (
            <>
              {isMockExamMode && (
                <div className="w-full md:w-80 shrink-0 bg-white p-6 border-2 border-zinc-300 md:sticky md:top-6 order-2 md:order-1 mt-6 md:mt-0 xl:max-h-[calc(100vh-6rem)] flex flex-col xl:overflow-hidden relative shadow-md rounded-3xl">
                  <div className="flex justify-between items-center mb-6 border-b border-zinc-100 pb-4">
                    <p className="font-bold text-zinc-800 uppercase text-base sm:text-lg tracking-wider">Danh sách<br/>câu hỏi</p>
                    <button 
                      onClick={() => setIsSubmitted(true)}
                      className="btn-primary py-2 px-4 text-xs font-semibold uppercase tracking-wider"
                    >
                      NỘP BÀI
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-3 pr-2 overflow-y-auto overflow-x-hidden scrollbar-hide pb-4">
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
                          className={`aspect-square border rounded-xl font-semibold flex items-center justify-center transition-all cursor-pointer select-none text-xs sm:text-sm
                            ${isCurrent ? 'bg-[#1d4ed8] text-white border-[#1d4ed8] scale-110 shadow-lg shadow-[#1d4ed8]/20 relative z-10' : 
                              ans ? 'bg-[#dbeafe] text-[#1d4ed8] border-[#93c5fd] shadow-sm' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 text-zinc-500'}
                          `}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-100 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex flex-col gap-2.5">
                     <div className="flex items-center gap-2">
                       <div className="w-3.5 h-3.5 bg-[#1d4ed8] rounded-md"></div>
                       <span>Đang làm</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <div className="w-3.5 h-3.5 bg-[#dbeafe] border border-[#93c5fd] rounded-md"></div>
                       <span>Đã chọn</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <div className="w-3.5 h-3.5 bg-zinc-50 border border-zinc-200 rounded-md"></div>
                       <span>Chưa làm</span>
                     </div>
                  </div>
                </div>
              )}
              <div className={`flex-1 w-full max-w-3xl flex flex-col min-w-0 ${isMockExamMode ? 'order-1 md:order-2' : ''}`}>
              {/* Question Meta */}
              <div className="flex items-center justify-between mb-6 pt-2">
                <button onClick={onBack} className="flex items-center text-zinc-500 hover:text-[#1d4ed8] transition-colors group z-20 relative flex-shrink-0 cursor-pointer select-none">
                  <ArrowLeft strokeWidth={2} className="w-5 h-5 mr-1.5 group-hover:-translate-x-1 transition-transform" />
                  <span className="font-semibold text-xs sm:text-sm">QUAY LẠI</span>
                </button>
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Streak Indicator */}
                  {!isExamMode && (
                    <motion.div 
                      animate={
                        streak >= 3 
                          ? { scale: [1, 1.05, 1] } 
                          : streakBroken 
                          ? { opacity: 0.5, filter: "grayscale(100%)" } 
                          : {}
                      }
                      className={`flex items-center gap-1.5 border px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm ${
                        streak >= 3 
                          ? "bg-[#eff6ff] border-[#93c5fd] text-[#1d4ed8]" 
                          : streak > 0 
                          ? "bg-zinc-50 border-zinc-200 text-[#1d4ed8]" 
                          : "bg-zinc-50 border-zinc-200/60 text-zinc-400"
                      }`}
                    >
                      <Flame className={`w-4 h-4 ${streak >= 3 ? "animate-pulse" : ""}`} />
                      <span className="text-xs">{streak}</span>
                      
                      {/* Streak Popup Messages */}
                      <AnimatePresence>
                        {showStreakPopup && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -40, scale: 1.1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute -top-4 right-0 z-50 whitespace-nowrap text-[#1d4ed8] font-black text-xs pointer-events-none drop-shadow-md"
                          >
                            {streakPopupText}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                  
                  <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-full hidden lg:flex">
                    <span className="text-xs font-semibold text-zinc-400">Vol</span>
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
                      className="w-16 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-[#1d4ed8] outline-none"
                    />
                  </div>
                  {/* Tắt/Bật Nhạc nền */}
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className="bg-zinc-50 border border-zinc-200 p-2 hover:bg-zinc-100 transition-colors rounded-full flex-shrink-0 cursor-pointer select-none relative"
                    title={isMuted ? "Bật nhạc nền" : "Tắt nhạc nền"}
                  >
                    <Music className={`w-4 h-4 transition-colors ${isMuted ? "text-zinc-400" : "text-[#1d4ed8]"}`} />
                    {isMuted && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-[18px] h-[2px] bg-zinc-400 rotate-45 transform origin-center rounded-full"></div>
                      </div>
                    )}
                  </button>

                  {/* Tắt/Bật Hiệu ứng âm thanh */}
                  <button 
                    onClick={() => setIsSFXMuted(!isSFXMuted)}
                    className="bg-zinc-50 border border-zinc-200 p-2 hover:bg-zinc-100 transition-colors rounded-full flex-shrink-0 cursor-pointer select-none"
                    title={isSFXMuted ? "Bật âm hiệu ứng" : "Tắt âm hiệu ứng"}
                  >
                    {isSFXMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-[#1d4ed8]" />}
                  </button>
                  {isExamMode && timeLeft !== null && (
                  <div className="bg-[#eff6ff] text-[#1d4ed8] border border-[#93c5fd]/50 font-semibold text-xs sm:text-sm px-3.5 py-1 rounded-full min-w-[70px] text-center shadow-sm tabular-nums">
                    {formatTime(timeLeft)}
                  </div>
                )}
                <div className="bg-zinc-50 border border-zinc-200 font-semibold text-xs sm:text-sm px-3.5 py-1 shrink-0 rounded-full text-zinc-500 tabular-nums">
                  <span className="font-bold text-zinc-800">{totalQuestions - queue.length + 1}</span> / {totalQuestions}
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-zinc-300 rounded-3xl p-6 sm:p-10 mb-24 md:mb-10 relative shadow-lg text-text-primary">
              {/* Question Text */}
              <div className="mb-6 relative z-10 text-text-primary">
                <h1 className="font-bold text-xs sm:text-sm leading-relaxed text-text-primary flex items-start flex-wrap gap-2">
                  <span className="inline-block bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider align-middle shrink-0 tabular-nums">
                    Q{currentQuestion.id} &bull; {currentQuestionTimer}s
                  </span>
                  <span className="flex-1 text-zinc-900 pt-0.5 text-sm sm:text-base">
                    <ContentRenderer content={mainQuestion} className="inline" />
                    {otherWays && (
                      <button 
                        onClick={() => setShowOtherWays(!showOtherWays)}
                        className="inline-flex items-center justify-center ml-2 text-zinc-400 hover:text-[#1d4ed8] transition-colors align-middle cursor-pointer"
                        title="Xem các cách hỏi khác"
                      >
                        <HelpCircle strokeWidth={2} className="w-5 h-5" />
                      </button>
                    )}
                  </span>
                </h1>
                
                {showOtherWays && otherWays && (
                  <div className="mt-4 bg-[#eff6ff]/40 border border-[#bfdbfe] p-4 text-left text-xs sm:text-sm text-zinc-700 rounded-2xl">
                    <p className="font-bold mb-2">Các cách hỏi khác:</p>
                    <ul className="space-y-1.5 list-disc list-inside marker:text-[#1d4ed8]">
                      {otherWays.map((way, idx) => (
                         <li key={idx} className="leading-snug font-medium"><ContentRenderer content={way} className="inline" /></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Answer Options */}
              <div className="space-y-4">
                {Object.entries(currentQuestion.options).map(([key, text]) => {
                  if (!text) return null;
                  
                  const isSelected = selectedOption === key;
                  const correctKey = currentQuestion.correct_answer?.trim().toUpperCase();
                  const isCorrectAnswerOption = key.toUpperCase() === correctKey;
                  
                  let buttonClass = "w-full text-left px-5 py-4 rounded-2xl transition-all duration-300 flex items-center gap-4 group cursor-pointer select-none ";
                  let circleClass = "w-9 h-9 border flex items-center justify-center font-bold text-sm sm:text-base flex-shrink-0 transition-colors rounded-full ";
                  let textClass = "text-xs sm:text-sm leading-relaxed flex-1 font-medium ";
                  
                  if (selectedOption) {
                    if (isExamMode) {
                      // Exam mode styling (no reveal)
                      if (isSelected) {
                        buttonClass += "border-2 border-[#1d4ed8] bg-[#eff6ff]/70 text-[#1d4ed8]";
                        circleClass += "border-[#1d4ed8] bg-[#1d4ed8] text-white";
                        textClass += "text-text-primary font-bold";
                      } else {
                        buttonClass += "border border-zinc-100 opacity-40 pointer-events-none bg-zinc-50";
                        circleClass += "border-zinc-200 text-zinc-400 bg-zinc-100";
                        textClass += "text-zinc-400";
                      }
                    } else {
                      // Normal mode styling (reveal answers immediately)
                      if (isSelected && isCorrect) {
                        buttonClass += "border-2 border-green-500 bg-green-50 text-green-900";
                        circleClass += "border-green-500 bg-green-500 text-white";
                        textClass += "text-green-900 font-bold";
                      } else if (isSelected && !isCorrect) {
                        buttonClass += "border-2 border-red-500 bg-red-50 text-red-600";
                        circleClass += "border-red-500 bg-red-600 text-white";
                        textClass += "text-red-600 font-bold";
                      } else if (isCorrectAnswerOption) {
                        buttonClass += "border-2 border-green-500 border-dashed bg-green-50/50 text-green-900";
                        circleClass += "border-green-500 bg-green-500 text-white";
                        textClass += "text-green-900 font-bold";
                      } else {
                        buttonClass += "border border-zinc-100 opacity-40 pointer-events-none bg-zinc-50";
                        circleClass += "border-zinc-200 text-zinc-400 bg-zinc-100";
                        textClass += "text-zinc-400";
                      }
                    }
                  } else {
                    // Interactive state before selection
                    buttonClass += "border-2 border-zinc-300 bg-white hover:border-[#1d4ed8] hover:bg-[#eff6ff]/30 hover:scale-[1.01]";
                    circleClass += "border-zinc-300 text-zinc-500 bg-zinc-50 group-hover:bg-[#1d4ed8] group-hover:text-white group-hover:border-[#1d4ed8]";
                    textClass += "text-text-primary";
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
                      
                      {/* Result Icons - Only in Normal Mode */}
                      {!isExamMode && selectedOption && isCorrectAnswerOption && (
                        <div className="ml-auto flex items-center justify-center shrink-0 w-8 h-8 bg-green-500 text-white rounded-full">
                          <Check strokeWidth={2.5} className="w-5 h-5" />
                        </div>
                      )}
                      {!isExamMode && selectedOption && isSelected && !isCorrect && (
                        <div className="ml-auto flex items-center justify-center shrink-0 w-8 h-8 bg-red-600 text-white rounded-full">
                          <X strokeWidth={2.5} className="w-5 h-5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {!isExamMode && selectedOption && (
                <div className="mt-6 pt-6 border-t border-zinc-100 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-[#eff6ff]/60 border border-[#bfdbfe] p-5 rounded-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">
                        Giải thích
                      </span>
                      {currentQuestion.knowledge_area && (
                        <span className="text-xs font-medium text-zinc-500">
                          {currentQuestion.knowledge_area}
                        </span>
                      )}
                    </div>
                    <div className="text-sm leading-relaxed font-medium text-zinc-800">
                      <ContentRenderer 
                        content={(currentQuestion.explanation && currentQuestion.explanation.trim() !== "") 
                          ? currentQuestion.explanation 
                          : `Chưa có giải thích chi tiết cho câu hỏi này. Đáp án đúng là ${currentQuestion.correct_answer}. Bạn hãy ôn tập thêm trong Giáo trình Kinh tế bảo hiểm.`
                        } 
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={feedbackRef} className="pb-28 md:pb-0 min-h-4" />
            </div>

            {/* Feedback Bar (Normal Mode) */}
            {!isExamMode && selectedOption && (
              <div className="fixed bottom-6 left-6 right-6 md:static bg-white border border-zinc-200 p-5 rounded-3xl flex items-center justify-between z-50 md:mt-2 shadow-lg">
                <div className="flex flex-col ml-1">
                  {isCorrect ? (
                    <>
                      <span className="text-green-600 font-bold text-base flex items-center gap-2 tracking-wider">
                        ĐÚNG RỒI! ✨
                      </span>
                      <span className="text-zinc-500 text-xs mt-0.5">Tiếp tục phát huy nhé!</span>
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 font-bold text-base flex items-center gap-2 tracking-wider">
                        SAI RỒI! 😅
                      </span>
                      <span className="text-zinc-500 text-xs mt-0.5">Câu hỏi sẽ được lặp lại để ôn luyện!</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleNext(isCorrect!)}
                  className="btn-primary py-2.5 px-6 text-xs font-semibold uppercase tracking-wider"
                >
                  Câu tiếp
                </button>
              </div>
            )}
            </div>
          </>
        )}
      </div>
    );
  };

  const [currentSong] = useState('/Cac-ca-khuc-SnapYT.App.mp3');

  // Synchronize audio with mute/volume state and play background music
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      if (isMuted) {
        audioRef.current.pause();
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            console.log("Background music play deferred until user interaction.", e);
          });
        }
      }
    }
  }, [isMuted, volume, currentSong]);

  // Handle document click/tap to bypass browser autoplay policy
  useEffect(() => {
    const playAudio = () => {
      if (audioRef.current && !isMuted && audioRef.current.paused) {
        audioRef.current.play().catch(e => console.log("Autoplay play deferred: ", e));
      }
    };
    
    document.addEventListener('click', playAudio, { once: true });
    document.addEventListener('touchstart', playAudio, { once: true });
    
    return () => {
      document.removeEventListener('click', playAudio);
      document.removeEventListener('touchstart', playAudio);
    };
  }, [isMuted]);

  return (
    <>
      <audio ref={audioRef} src={currentSong} autoPlay loop muted={isMuted} className="hidden" />
      <audio ref={correctAudioRef} src="/true.mp3" preload="auto" className="hidden" />
      <audio ref={wrongAudioRef} src="/false.mp3" preload="auto" className="hidden" />
      <audio ref={endAudioRef} src="/end.mp3" preload="auto" className="hidden" />
      <audio ref={streak5AudioRef} src="/streak5.mp3" preload="auto" className="hidden" />
      {renderQuizContent()}
    </>
  );
}
