import { useState, useEffect } from 'react';
import { History, X, Clock, ChevronRight, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { getAssessments, getAssessment, deleteAssessment } from '../services/api';
import ConfirmModal from './ConfirmModal';

export default function HistorySidebar({ isOpen, onClose, onLoadAssessment }) {
  const [assessments, setAssessments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [isDeletingId, setIsDeletingId] = useState(null);

  // Modal confirm state
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchAssessments();
    }
  }, [isOpen]);

  const fetchAssessments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAssessments();
      setAssessments(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (id) => {
    setLoadingId(id);
    setError(null);
    try {
      const response = await getAssessment(id);
      onLoadAssessment(response.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to load assessment details');
    } finally {
      setLoadingId(null);
    }
  };

  const openDeleteModal = (e, item) => {
    e.stopPropagation();
    setDeleteTarget(item);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setIsDeletingId(id);
    try {
      await deleteAssessment(id);
      setAssessments(assessments.filter(a => a.id !== id));
      if (loadingId === id) setLoadingId(null);
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Failed to delete assessment');
    } finally {
      setIsDeletingId(null);
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed top-0 right-0 h-full w-96 bg-slate-900 border-l border-white/10 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div className="flex items-center gap-3 text-white font-semibold">
            <History size={18} className="text-indigo-400" />
            Assessment History
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {isLoading && assessments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-sm">Loading history...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-1">Error</strong>
                {error}
                <button 
                  onClick={fetchAssessments}
                  className="mt-2 text-xs font-medium underline hover:text-red-300"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : assessments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm text-center px-4">
              <History size={32} className="mb-3 opacity-20" />
              No past assessments found. Analyze a process to see it here.
            </div>
          ) : (
            assessments.map((item) => (
              <div 
                key={item.id}
                onClick={() => handleLoad(item.id)}
                className={`group cursor-pointer p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/30 transition-all ${
                  loadingId === item.id ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-sm font-semibold text-white truncate pr-4">
                    {item.title}
                  </h4>
                  {loadingId === item.id ? (
                    <Loader2 size={14} className="text-indigo-400 animate-spin shrink-0" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => openDeleteModal(e, item)}
                        disabled={isDeletingId === item.id}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Delete assessment"
                      >
                        {isDeletingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                      <ChevronRight size={14} className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-3">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    {formatDate(item.created_at)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    {item.step_count} steps
                  </div>
                  {item.highest_acs > 0 && (
                    <div className="flex items-center gap-1.5 font-medium text-amber-400">
                      ACS {item.highest_acs.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Assessment?"
        message={`Are you sure you want to delete "${deleteTarget?.title || 'this assessment'}"? All analysis data and reports for this process will be permanently removed.`}
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={Boolean(isDeletingId)}
      />
    </>
  );
}
