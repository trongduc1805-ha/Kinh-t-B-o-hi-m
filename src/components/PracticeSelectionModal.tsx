import React from 'react';
import { X } from 'lucide-react';

interface PracticeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExam: (examId: string) => void;
}

export default function PracticeSelectionModal({ isOpen, onClose, onSelectExam }: PracticeSelectionModalProps) {
  if (!isOpen) return null;

  const exams = [
    { id: 'de1', title: 'Đề số 1', desc: 'Luyện đề tổng hợp số 1' },
    { id: 'de2', title: 'Đề số 2', desc: 'Luyện đề tổng hợp số 2' },
    { id: 'de3', title: 'Đề số 3', desc: 'Luyện đề tổng hợp số 3' },
    { id: 'de4', title: 'Đề số 4', desc: 'Luyện đề tổng hợp số 4' },
    { id: 'de5', title: 'Đề số 5', desc: 'Luyện đề tổng hợp số 5' },
    { id: 'de6', title: 'Đề số 6', desc: 'Luyện đề tổng hợp số 6' },
    { id: 'de7', title: 'Đề số 7', desc: 'Luyện đề tổng hợp số 7' },
    { id: 'de8', title: 'Đề số 8', desc: 'Luyện đề tổng hợp số 8' },
  ];

  const colors = [
    'bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-[#eff6ff] hover:border-[#1d4ed8]',
    'bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-[#eff6ff] hover:border-[#2563eb]',
    'bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-[#eff6ff] hover:border-[#0284c7]',
    'bg-zinc-50 border-zinc-300 text-zinc-800 hover:bg-[#eff6ff] hover:border-[#3b82f6]',
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="bg-white border-2 border-zinc-300 w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col relative overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 bg-white shrink-0 relative overflow-hidden">
          <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider text-zinc-900">DANH SÁCH ĐỀ THI TRẮC NGHIỆM</h2>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 border border-zinc-200 transition-colors cursor-pointer select-none"
          >
            <X strokeWidth={2} className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh] scrollbar-hide">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {exams.map((exam, index) => (
              <button
                key={exam.id}
                onClick={() => {
                  onSelectExam(exam.id);
                  onClose();
                }}
                className={`group flex flex-col items-start p-4 border-2 rounded-2xl ${colors[index % colors.length]} transition-all duration-200 text-left cursor-pointer select-none shadow-sm`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm sm:text-base uppercase tracking-wider">{exam.title}</span>
                </div>
                <p className="text-[11px] font-semibold bg-zinc-200/50 text-zinc-600 px-2.5 py-0.5 rounded-full border border-zinc-200/50 inline-block uppercase mt-1">
                  {exam.desc}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
