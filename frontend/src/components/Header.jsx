import { useState, useRef, useEffect } from 'react';
import { Cpu, Zap, History, KeyRound, BookOpen, User, LogOut, ChevronDown } from 'lucide-react';

export default function Header({ onOpenHistory, onOpenApiKeys, onOpenApiDocs, user, onLogout }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Use the first letter of the name or email for the avatar if available
  const avatarText = user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : <User size={16} />);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Cpu size={20} className="text-white" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">AP Discovery Agent</h1>
            <p className="text-[11px] text-slate-500 font-medium">AlphaFold • AuxiLab</p>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Zap size={13} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Online</span>
          </div>

          <div className="w-px h-6 bg-slate-800 hidden sm:block"></div>

          {/* User Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 px-1 py-1 rounded-full hover:bg-white/5 transition-colors group focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-semibold text-sm group-hover:bg-indigo-500/30 transition-colors">
                {avatarText}
              </div>
              <span className="text-sm font-medium text-slate-300 hidden sm:block max-w-[120px] truncate">
                {user?.name || 'User'}
              </span>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-3 border-b border-slate-700/50 mb-1 bg-slate-900/50">
                  <p className="text-sm font-semibold text-white truncate">{user?.name || 'User'}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
                </div>
                
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenHistory();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <History size={16} className="text-slate-400" />
                  View History
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenApiKeys && onOpenApiKeys();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <KeyRound size={16} className="text-slate-400" />
                  API Keys
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onOpenApiDocs && onOpenApiDocs();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <BookOpen size={16} className="text-slate-400" />
                  API Docs
                </button>
                
                <div className="h-px bg-slate-700/50 my-1"></div>
                
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onLogout && onLogout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-400/10 transition-colors"
                >
                  <LogOut size={16} className="text-rose-400" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
