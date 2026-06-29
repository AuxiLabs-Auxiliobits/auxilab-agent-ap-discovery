import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Mic, Video, Type, Send, X, Sparkles, Square, Loader2, Zap, MessageSquareMore, MessageCircle, Radio } from 'lucide-react';
import useMicRecorder from '../hooks/useMicRecorder';

const SUPPORTED_EXTENSIONS = ['.txt', '.docx', '.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4', '.mov'];

export default function InputPanel({ onAnalyzeText, onAnalyzeFile, onStartInteractive, onStartLiveChat, isLoading, hasSavedChat = false }) {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showModeSelect, setShowModeSelect] = useState(false);
  const fileInputRef = useRef(null);

  // Mic recorder — on transcription complete, switch to text mode and append text
  const handleTranscriptionComplete = useCallback((transcribedText) => {
    setText(prev => {
      const separator = prev.trim() ? '\n\n' : '';
      return prev + separator + transcribedText;
    });
    setMode('text');
  }, []);

  const mic = useMicRecorder(handleTranscriptionComplete);

  const handleSubmit = () => {
    const ready = mode === 'text' ? text.trim().length >= 50 : mode === 'file' ? !!file : false;
    if (ready) {
      setShowModeSelect(true);
    }
  };

  const handleAutoMode = () => {
    setShowModeSelect(false);
    if (mode === 'text' && text.trim().length >= 50) {
      onAnalyzeText(text);
    } else if (mode === 'file' && file) {
      onAnalyzeFile(file);
    }
  };

  const handleInteractiveMode = () => {
    setShowModeSelect(false);
    if (mode === 'text' && text.trim().length >= 50) {
      onStartInteractive('text', text);
    } else if (mode === 'file' && file) {
      onStartInteractive('file', file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleFileSelect = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const getFileIcon = (filename) => {
    if (!filename) return <FileText size={24} />;
    const ext = filename.split('.').pop().toLowerCase();
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return <Mic size={24} />;
    if (['mp4', 'webm', 'mov'].includes(ext)) return <Video size={24} />;
    return <FileText size={24} />;
  };

  const canSubmit = mode === 'text' ? text.trim().length >= 50 : mode === 'file' ? !!file : false;

  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-black/20 relative"
      style={{ animation: 'fade-in-up 0.5s ease-out forwards' }}
    >
      {/* Title */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-indigo-400" />
        <h2 className="text-lg font-bold text-white">Analyze AP Process</h2>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Paste a process description, upload an interview recording, or use your mic
      </p>

      {/* Live Chat CTA */}
      {!hasSavedChat ? (
        <button
          onClick={() => onStartLiveChat(false)}
          disabled={isLoading}
          className="group w-full mb-6 p-4 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/[0.06] to-cyan-500/[0.04] hover:from-violet-500/[0.12] hover:to-cyan-500/[0.08] hover:border-violet-500/40 transition-all duration-300 text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <MessageCircle size={22} className="text-violet-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-bold text-white">Start Live Chat</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Radio size={7} />
                  Voice
                </span>
              </div>
              <p className="text-xs text-slate-400">Talk to the AI agent — describe your process in a real-time conversation. No transcript needed.</p>
            </div>
            <div className="text-violet-400/60 group-hover:text-violet-400 transition-colors">
              <Send size={18} />
            </div>
          </div>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => onStartLiveChat(true)}
            disabled={isLoading}
            className="group w-full p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.08] to-emerald-500/[0.02] hover:from-emerald-500/[0.15] hover:to-emerald-500/[0.05] hover:border-emerald-500/50 transition-all duration-300 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <MessageCircle size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white mb-0.5">Resume Live Chat</h4>
                <p className="text-[11px] text-emerald-400/80">Continue your previous session</p>
              </div>
            </div>
          </button>
          
          <button
            onClick={() => onStartLiveChat(false)}
            disabled={isLoading}
            className="group w-full p-4 rounded-2xl border border-white/5 bg-slate-800/40 hover:bg-slate-800/80 hover:border-white/10 transition-all duration-300 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-700 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Sparkles size={20} className="text-slate-400 group-hover:text-violet-400 transition-colors" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white mb-0.5">Start Fresh Chat</h4>
                <p className="text-[11px] text-slate-400">Clear history and restart</p>
              </div>
            </div>
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Or provide a transcript</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>

      {/* Mode Toggle */}
      <div className="flex flex-wrap sm:inline-flex rounded-xl bg-slate-800/60 p-1 gap-1 mb-6 border border-white/5 w-full sm:w-auto">
        <button
          onClick={() => setMode('text')}
          className={`flex-1 justify-center sm:flex-none flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            mode === 'text'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Type size={15} /> Text
        </button>
        <button
          onClick={() => setMode('file')}
          className={`flex-1 justify-center sm:flex-none flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            mode === 'file'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Upload size={15} /> File
        </button>
        <button
          onClick={() => setMode('voice')}
          className={`flex-1 justify-center sm:flex-none flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            mode === 'voice'
              ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Mic size={15} /> Voice
        </button>
      </div>

      {/* Text Input */}
      {mode === 'text' && (
        <div>
          <textarea
            className="w-full min-h-[220px] rounded-xl bg-slate-800/50 border border-white/[0.06] text-slate-200 text-sm leading-relaxed p-5 resize-y outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-600 transition-all"
            placeholder={"Paste your AP process description here...\n\nExample: Our AP process starts when invoices arrive by email. Sarah downloads the PDF invoices and manually keys data into SAP every morning — about 200 invoices per week..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${
                text.trim().length >= 50 ? 'w-16 bg-emerald-500' : `bg-slate-600`
              }`} style={{ width: text.trim().length >= 50 ? 64 : Math.min(64, (text.trim().length / 50) * 64) }} />
              <span className={`text-xs font-medium ${text.trim().length >= 50 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {text.trim().length >= 50 ? '✓ Ready' : `${text.trim().length}/50 min`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* File Upload */}
      {mode === 'file' && (
        <div>
          {!file ? (
            <div
              className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <Upload size={24} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-300 mb-1">
                Drop your file here or{' '}
                <span className="text-indigo-400 font-semibold">browse</span>
              </p>
              <p className="text-xs text-slate-500">
                .txt · .docx · .mp3 · .wav · .mp4 · .mov · .webm
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_EXTENSIONS.join(',')}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/50 border border-white/[0.06]">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                {getFileIcon(file.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-2.5 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Voice Recording */}
      {mode === 'voice' && (
        <div className="flex flex-col items-center py-8">
          {mic.isTranscribing ? (
            /* Transcribing State */
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Loader2 size={36} className="text-indigo-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Transcribing with AlphaFold AI...</p>
                <p className="text-xs text-slate-500 mt-1">Supports English, Hindi & 100+ languages</p>
              </div>
            </div>
          ) : mic.isRecording ? (
            /* Recording State */
            <div className="flex flex-col items-center gap-5">
              {/* Pulsing mic indicator */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute -inset-3 rounded-full bg-rose-500/10 animate-pulse" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-xl shadow-rose-500/30">
                  <Mic size={36} className="text-white" />
                </div>
              </div>

              {/* Timer */}
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-2xl font-mono font-bold text-white tracking-wider">
                  {mic.formattedDuration}
                </span>
              </div>

              <p className="text-xs text-slate-400">Recording... Speak clearly into your microphone</p>

              {/* Controls */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={mic.cancelRecording}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  onClick={mic.stopRecording}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-semibold shadow-lg shadow-rose-500/25 hover:shadow-xl transition-all"
                >
                  <Square size={14} className="fill-current" />
                  Stop & Transcribe
                </button>
              </div>
            </div>
          ) : (
            /* Idle State */
            <div className="flex flex-col items-center gap-5">
              <button
                onClick={mic.startRecording}
                className="group relative w-24 h-24 rounded-full bg-gradient-to-br from-rose-500/10 to-pink-500/10 border-2 border-rose-500/30 flex items-center justify-center hover:from-rose-500 hover:to-pink-600 hover:border-transparent hover:shadow-xl hover:shadow-rose-500/30 transition-all duration-300"
              >
                <Mic size={36} className="text-rose-400 group-hover:text-white transition-colors" />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Click to start recording</p>
                <p className="text-xs text-slate-500 mt-1">Supports English, Hindi & 100+ languages</p>
              </div>
            </div>
          )}

          {/* Error display */}
          {mic.error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-medium w-full max-w-md text-center">
              {mic.error}
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      {mode !== 'voice' && (
        <button
          className={`w-full mt-6 py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
            canSubmit && !isLoading
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
          onClick={handleSubmit}
          disabled={!canSubmit || isLoading}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-600 border-t-white rounded-full" style={{ animation: 'spin 0.7s linear infinite' }} />
              Analyzing with AlphaFold AI...
            </>
          ) : (
            <>
              <Send size={16} />
              Run Assessment
            </>
          )}
        </button>
      )}

      {/* ── Analysis Mode Selection Overlay ─────────────────────── */}
      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md" style={{ animation: 'fade-in-up 0.25s ease-out forwards' }}>
          <div className="w-full max-w-lg mx-4 rounded-3xl border border-white/[0.08] bg-slate-900/95 backdrop-blur-2xl p-8 shadow-2xl shadow-black/50" style={{ animation: 'fade-in-up 0.35s ease-out forwards' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <Sparkles size={20} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Choose Analysis Mode</h3>
                  <p className="text-xs text-slate-500">How should the agent analyze your process?</p>
                </div>
              </div>
              <button
                onClick={() => setShowModeSelect(false)}
                className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode Cards */}
            <div className="grid grid-cols-1 gap-3 mt-6">
              {/* Auto Mode */}
              <button
                onClick={handleAutoMode}
                className="group text-left p-5 rounded-2xl border border-white/[0.06] hover:border-amber-500/30 bg-slate-800/40 hover:bg-amber-500/[0.04] transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Zap size={22} className="text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                      Auto Mode
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-wider">Fast</span>
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Agent analyzes your process immediately — no questions asked. Best for clear, detailed transcripts with all the information needed.
                    </p>
                  </div>
                </div>
              </button>

              {/* Interactive Mode */}
              <button
                onClick={handleInteractiveMode}
                className="group text-left p-5 rounded-2xl border border-white/[0.06] hover:border-violet-500/30 bg-slate-800/40 hover:bg-violet-500/[0.04] transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <MessageSquareMore size={22} className="text-violet-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                      Interactive Mode
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-[10px] font-bold uppercase tracking-wider">Recommended</span>
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Agent reads your transcript and asks targeted follow-up questions first. Produces a deeper, more accurate analysis report.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <p className="text-[10px] text-slate-600 text-center mt-5">
              You can always switch modes in future assessments
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
