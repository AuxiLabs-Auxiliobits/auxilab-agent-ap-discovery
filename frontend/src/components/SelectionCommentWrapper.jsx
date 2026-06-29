import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, X, Settings, Send, Edit } from 'lucide-react';

export default function SelectionCommentWrapper({ children, onAddComment, docType = 'dashboard' }) {
  const containerRef = useRef(null);
  const [floatingPos, setFloatingPos] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');

  // Add selected text and comment to the pending edit queue
  const handleAddEditToQueue = () => {
    if (!editInstruction.trim()) return;
    if (onAddComment) {
      onAddComment({ selectedText, comment: editInstruction, docType });
    }
    setEditInstruction('');
    setSelectedText('');
    setShowEditModal(false);
  };

  // Listen for browser selections inside the container
  useEffect(() => {
    const handleTextSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!showEditModal) {
          setFloatingPos(null);
        }
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        if (!showEditModal) setFloatingPos(null);
        return;
      }

      // Check if selection is within the container
      if (containerRef.current && containerRef.current.contains(selection.anchorNode)) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          setFloatingPos({
            top: rect.top - 45, // positioned slightly above the selection
            left: rect.left + rect.width / 2, // centered horizontally
          });
          setSelectedText(text);
        } catch (err) {
          console.error("Error calculating selection bounds:", err);
        }
      }
    };

    const handleMouseUp = (e) => {
      const floatingBtn = document.getElementById('floating-edit-btn');
      if (floatingBtn && floatingBtn.contains(e.target)) return;
      if (showEditModal) return;

      // Wait a moment for selection properties to be set by the browser
      setTimeout(handleTextSelection, 10);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showEditModal]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {children}

      {/* Floating Action Button near selection */}
      {floatingPos && !showEditModal && createPortal(
        <button
          id="floating-edit-btn"
          onClick={() => setShowEditModal(true)}
          className="fixed z-[60] flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-full shadow-xl shadow-black/40 hover:bg-slate-800 hover:text-violet-200 transition-all animate-bounce-short"
          style={{
            top: floatingPos.top,
            left: floatingPos.left,
            transform: 'translateX(-50%)',
            animation: 'bounce-short 2s infinite ease-in-out'
          }}
        >
          <Edit size={12} />
          Add Comment
        </button>,
        document.body
      )}

      {/* Edit Instruction Modal */}
      {showEditModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
          style={{ animation: 'fade-in 0.2s ease-out' }}>
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
            style={{ animation: 'scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white">Add Comment to Selection</h3>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditInstruction('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Selected Text:</span>
                <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 text-xs text-slate-300 italic font-mono max-h-36 overflow-y-auto leading-relaxed scrollbar-thin">
                  "{selectedText}"
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">How should AI edit or explain this?</label>
                <textarea
                  className="w-full h-32 px-4 py-3 rounded-xl bg-slate-800/60 border border-white/5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 transition-all resize-none"
                  placeholder="Describe your edits or ask for an explanation... (e.g. 'Explain this' or 'Update this to XYZ')"
                  value={editInstruction}
                  onChange={e => setEditInstruction(e.target.value)}
                />
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <Settings size={14} className="text-violet-400 mt-0.5 flex-shrink-0 animate-pulse" />
                <p className="text-[10px] text-violet-300 leading-normal">
                  This comment will be added to the Floating Agent queue. You can add multiple comments and submit them all at once.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-slate-950/40">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditInstruction('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 border border-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEditToQueue}
                disabled={!editInstruction.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={13} />
                Add to Queue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Internal CSS for animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-up {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0) translateX(-50%); }
          50% { transform: translateY(-4px) translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
