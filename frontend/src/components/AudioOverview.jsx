import React, { useState, useRef } from 'react';
import { Play, Pause, Loader2, Volume2, Globe, Headphones, Download } from 'lucide-react';
import { generateAudioOverview } from '../services/api';

const LANGUAGES = [
  'English',
  'Hindi',
  'Korean',
  'Punjabi',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Russian',
  'Malayalam',
  'Kannada',
  'Spanish',
  'French',
  'German',
  'Mandarin Chinese',
  'Japanese'
];

export default function AudioOverview({ assessmentId, audioScripts }) {
  const [language, setLanguage] = useState('English');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  
  // Check if we already have a script saved for this language
  const hasScript = audioScripts && audioScripts[language];

  const handleGenerate = async () => {
    if (!assessmentId) return;

    setIsLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const url = await generateAudioOverview(assessmentId, language);
      setAudioUrl(url);

      // Auto-play when ready
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(e => console.error("Autoplay failed:", e));
        }
      }, 500);
    } catch (err) {
      console.error("Audio generation failed:", err);
      setError(err.message || "Failed to generate audio overview.");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  return (
    <div className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-5 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/30">
          <Headphones size={24} className="text-indigo-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Audio Overview <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] uppercase tracking-wider font-bold">New</span>
          </h3>
          <p className="text-xs text-slate-400">Listen to a detailed podcast-style analysis of your report.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
        {/* Language Selector */}
        {!audioUrl && !isLoading && (
          <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
            <Globe size={16} className="text-slate-400" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-200 outline-none cursor-pointer focus:ring-0"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang} className="bg-slate-800 text-slate-200">{lang}</option>
              ))}
            </select>
          </div>
        )}

        {/* Generate Button or Audio Player */}
        {!audioUrl ? (
          <button
            onClick={handleGenerate}
            disabled={isLoading || !assessmentId}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 disabled:opacity-70 disabled:cursor-not-allowed group w-full sm:w-auto flex-1 sm:flex-none"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {hasScript ? 'Loading Audio...' : 'Generating Audio...'}
              </>
            ) : (
              <>
                <Volume2 size={16} className="group-hover:scale-110 transition-transform" />
                {hasScript ? 'Load Audio' : 'Generate Audio'}
              </>
            )}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 bg-slate-800/80 p-1.5 pr-4 rounded-3xl border border-slate-700 w-full sm:w-auto">
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-md"
            >
              {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-1" />}
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white">Playing in {language}</span>
              <span className="text-[10px] text-indigo-400 font-medium">AlphaFold Audio</span>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
              controls
            />

            <a 
              href={audioUrl} 
              download={`AP_Process_Audio_Overview_${language}.wav`}
              className="ml-2 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Download Audio"
            >
              <Download size={14} />
            </a>

            <button
              onClick={() => {
                setAudioUrl(null);
                setIsPlaying(false);
              }}
              className="ml-2 text-xs text-slate-400 hover:text-white underline underline-offset-2"
            >
              New
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute -bottom-8 right-0 text-xs text-red-400 font-medium bg-slate-900/80 px-3 py-1 rounded-md border border-red-500/20">
          {error}
        </div>
      )}
    </div>
  );
}
