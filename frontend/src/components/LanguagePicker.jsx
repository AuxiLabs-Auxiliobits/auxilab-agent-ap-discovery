import React, { useState, useEffect } from 'react';
import { X, Globe2, Radio, Sparkles } from 'lucide-react';

const LANGUAGES = [
  { code: 'English', label: 'English', flag: '🇬🇧' },
  { code: 'Hindi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'Punjabi', label: 'Punjabi', flag: '🇮🇳' },
  { code: 'Spanish', label: 'Spanish', flag: '🇪🇸' },
  { code: 'French', label: 'French', flag: '🇫🇷' },
  { code: 'German', label: 'German', flag: '🇩🇪' },
  { code: 'Portuguese', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'Arabic', label: 'Arabic', flag: '🇸🇦' },
  { code: 'Japanese', label: 'Japanese', flag: '🇯🇵' },
  { code: 'Korean', label: 'Korean', flag: '🇰🇷' },
  { code: 'Chinese (Simplified)', label: 'Chinese (Simplified)', flag: '🇨🇳' }
];

export default function LanguagePicker({ isOpen, isResume, defaultLanguage, onConfirm, onCancel }) {
  const [selectedLang, setSelectedLang] = useState('English');

  useEffect(() => {
    if (isOpen) {
      setSelectedLang(defaultLanguage || 'English');
    }
  }, [isOpen, defaultLanguage]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 shadow-2xl rounded-3xl overflow-hidden flex flex-col transform transition-all animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
              <Globe2 size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Select Language</h3>
              <p className="text-xs text-slate-400 mt-0.5">Choose your preferred language</p>
            </div>
          </div>
          <button 
            onClick={onCancel} 
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            {isResume ? (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-sm mb-4">
                <Sparkles size={16} className="shrink-0 mt-0.5" />
                <p>Resuming session. Aria remembers you were speaking <strong>{defaultLanguage}</strong>.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-300 mb-4">
                Aria will speak and respond fluently in the language you select. The final analysis report will always be generated in English.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedLang === lang.code
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-medium text-sm">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onConfirm(selectedLang)}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-colors shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            <Radio size={18} />
            {isResume ? 'Resume Chat' : 'Start Live Chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
