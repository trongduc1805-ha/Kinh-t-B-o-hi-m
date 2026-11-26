import { Question, Chapter } from '../types';

import de1 from '../data/de1.json';
import de2 from '../data/de2.json';
import de3 from '../data/de3.json';
import de4 from '../data/de4.json';
import de5 from '../data/de5.json';
import de6 from '../data/de6.json';
import de7 from '../data/de7.json';
import de8 from '../data/de8.json';

const examMap: Record<string, any[]> = {
  de1, de2, de3, de4, de5, de6, de7, de8
};

export function generateSpecificExam(examId: string): Chapter {
  const data = examMap[examId] || [];
  
  const mappedQuestions: Question[] = (data as any[]).map((q, idx) => ({
    id: q.id || `${examId}_${idx}`,
    content: q.content || q.question || "",
    options: q.options || { A: "", B: "", C: "", D: "" },
    correct_answer: q.correct_answer || q.answer || "",
    knowledge_area: q.knowledge_area || q.topic || "",
    explanation: q.explanation || "",
    difficulty: q.difficulty,
    bloom_level: q.bloom_level,
    question_type: q.question_type,
    source_reference: q.source_reference,
    chapterId: 1000 // Virtual chapter for practice exams
  }));

  const examNumber = examId.replace('de', '');

  return {
    chapter: 1000 + parseInt(examNumber || '1', 10),
    chapter_title: `ĐỀ THI TỔNG HỢP - ĐỀ SỐ ${examNumber}`,
    timeLimit: 40 * 60, // 40 minutes default
    questions: mappedQuestions
  };
}
