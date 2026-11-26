import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, ArrowLeft, Lightbulb, BookOpen, Calculator, Info, ChevronRight, Mic } from 'lucide-react';

interface SmartCalcHelpSlide {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  example?: string;
  steps?: string[];
}

const SmartCalcHelpSlideContent: SmartCalcHelpSlide[] = [
  {
    id: 'calculation',
    title: '📊 Basic Calculation',
    icon: Calculator,
    description: 'Enter an item ID and press + to add it. Type the product ID and quantity using * (e.g., 1001*3 adds 3 units of item 1001).',
    steps: [
      'Type item ID',
      'Press * for quantity',
      'Press + to add',
      'Item appears in list'
    ]
  },
  {
    id: 'discount',
    title: '💰 Discounts',
    icon: Lightbulb,
    description: 'Apply discounts using BILL_DISC button. Toggle between percentage and amount by pressing it again.',
    steps: [
      'Press BILL_DISC',
      'Cycle % or ₹',
      'Enter discount value',
      'Applied to total'
    ]
  },
  {
    id: 'remove',
    title: '🗑️ Remove Items',
    icon: X,
    description: 'Type - followed by item ID to remove an item. Or press - alone to start negative number.',
    steps: [
      'Type - (minus)',
      'Enter item ID',
      'Item removed',
      'Or use - for negative'
    ]
  },
  {
    id: 'voice',
    title: '🎤 Voice Input',
    icon: Mic,
    description: 'Use the microphone button to speak items. Just say "1001 apple 2" and it will add 2 apples.',
    steps: [
      'Tap microphone',
      'Speak item IDs',
      'Items added automatically',
      'Works with prices too'
    ]
  },
  {
    id: 'total',
    title: '💳 Total & Rounding',
    icon: Info,
    description: 'The bottom bar shows the total payable. Use round-up feature (10, 100) to round up automatically.',
    steps: [
      'Bottom bar shows total',
      'Set round-up to 10 or 100',
      'Total rounded automatically',
      'Round-up amount shown'
    ]
  },
  {
    id: 'memory',
    title: '🎯 Smart Calculator Memory',
    icon: BookOpen,
    description: 'The smart calculator remembers previous entries. Multiple items can be added in one session.',
    steps: [
      'Items persist',
      'Multiple additions allowed',
      'Use - to remove',
      'Complete with Save'
    ]
  }
];

interface SmartCalcHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SmartCalcHelpModal: React.FC<SmartCalcHelpModalProps> = ({ isOpen, onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const totalSlides = SmartCalcHelpSlideContent.length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Smart Calculator Guide</h2>
              <p className="text-xs text-slate-400">How it works</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Slides */}
        <div className="overflow-y-auto max-h-[60vh]">
          <div className="p-6 space-y-6">
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2">
              {SmartCalcHelpSlideContent.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentSlide(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === currentSlide ? 'bg-blue-600 w-6' : 'bg-slate-300 dark:bg-slate-700'}`}
                />
              ))}
            </div>

            {/* Slide Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${currentSlide % 2 === 0 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'}`}>
                  <div style={{ display: 'flex' }}>
                    {React.createElement(SmartCalcHelpSlideContent[currentSlide].icon, { className: "w-7 h-7" })}
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-800 dark:text-white">
                  {SmartCalcHelpSlideContent[currentSlide].title}
                </h3>

                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {SmartCalcHelpSlideContent[currentSlide].description}
                </p>

                {SmartCalcHelpSlideContent[currentSlide].steps && (
                  <div className="mt-4 space-y-2">
                    {SmartCalcHelpSlideContent[currentSlide].steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        {step}
                      </div>
                    ))}
                  </div>
                )}

                {/* Example code box */}
                {SmartCalcHelpSlideContent[currentSlide].example && (
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Example</p>
                    <code className="text-sm font-mono text-blue-600 dark:text-blue-400 break-all">
                      {SmartCalcHelpSlideContent[currentSlide].example}
                    </code>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4">
                  {currentSlide > 0 && (
                    <button
                      onClick={() => setCurrentSlide(prev => prev - 1)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Previous
                    </button>
                  )}
                  {currentSlide < totalSlides - 1 && (
                    <button
                      onClick={() => setCurrentSlide(prev => prev + 1)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
          <button
            onClick={onClose}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Close Guide
          </button>
          <button
            onClick={() => setCurrentSlide(0)}
            className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            Start from beginning
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SmartCalcHelpModal;
