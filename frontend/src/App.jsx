import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, FileText, ArrowLeft, Cpu, Mic, BarChart3, Workflow, RefreshCw, MessageSquare, BookOpen } from 'lucide-react';
import Header from './components/Header';
import InputPanel from './components/InputPanel';
import StatsCards from './components/StatsCards';
import ExecutiveSummary from './components/ExecutiveSummary';
import ProcessMapTable from './components/ProcessMapTable';
import OpportunityCards from './components/OpportunityCards';
import NonAutomatedCards from './components/NonAutomatedCards';
import InsightsPanel from './components/InsightsPanel';
import ReportView from './components/ReportView';
import HistorySidebar from './components/HistorySidebar';
import AudioOverview from './components/AudioOverview';
import FlowchartView from './components/FlowchartView';
import ChatView from './components/ChatView';
import DocumentView from './components/DocumentView';
import FollowUpChat from './components/FollowUpChat';
import LiveChat from './components/LiveChat';
import AnalyticsCharts from './components/AnalyticsCharts';
import RequiredFactsModal from './components/RequiredFactsModal';
import SelectionCommentWrapper from './components/SelectionCommentWrapper';
import LanguagePicker from './components/LanguagePicker';
import ApiKeysSettings from './components/ApiKeysSettings';
import ApiDocs from './components/ApiDocs';
import { analyzeText, analyzeFile, checkAuth, logout, updateAssessmentBpmn, updateAssessmentChat, updateAssessmentHourlyRate, getLiveChatSession, deleteLiveChatSession } from './services/api';

import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';

function ProtectedRoute({ children, setUser }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    checkAuth()
      .then((data) => {
        setIsAuthenticated(true);
        setUser(data.user);
      })
      .catch(() => setIsAuthenticated(false));
  }, [setUser]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white"><div className="animate-pulse">Loading secure session...</div></div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function Dashboard({ user }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isApiDocsOpen, setIsApiDocsOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [lastInput, setLastInput] = useState({ type: null, payload: null, context: null, transcript: null });

  // Interactive follow-up mode state
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [pendingInputType, setPendingInputType] = useState(null); // 'text' | 'file'
  const [pendingInputPayload, setPendingInputPayload] = useState(null);

  // Required-facts modal (shown when grounded critical facts are missing)
  const [dismissedFacts, setDismissedFacts] = useState(false);

  // Global Pending Edits for Document -> Agent integration
  const [pendingDocEdits, setPendingDocEdits] = useState([]);

  // Live Chat state
  const [showLiveChat, setShowLiveChat] = useState(false);
  const [hasSavedChat, setHasSavedChat] = useState(false);
  const [savedChatLanguage, setSavedChatLanguage] = useState('English');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [pendingLiveChatResume, setPendingLiveChatResume] = useState(false);
  const [liveChatLanguage, setLiveChatLanguage] = useState('English');

  const checkSavedChatSession = useCallback(async () => {
    try {
      const res = await getLiveChatSession();
      setHasSavedChat(res.data?.messages && res.data.messages.length > 0);
      setSavedChatLanguage(res.data?.language || 'English');
    } catch (e) {
      console.error("Failed to check saved chat session", e);
      setHasSavedChat(false);
      setSavedChatLanguage('English');
    }
  }, []);

  useEffect(() => {
    checkSavedChatSession();
  }, [checkSavedChatSession]);

  // Reset the required-facts prompt whenever a new analysis result arrives
  useEffect(() => {
    setDismissedFacts(false);
  }, [result]);

  const handleSaveBpmnXml = async (xml) => {
    if (!result || !result.id) return;
    
    // Update local state first to keep state in sync
    setResult(prev => {
      if (!prev || prev.id !== result.id) return prev;
      return {
        ...prev,
        bpmn_xml: xml
      };
    });
    
    // Call API to persist in MongoDB
    try {
      await updateAssessmentBpmn(result.id, xml);
    } catch (err) {
      console.error("Failed to persist BPMN XML:", err);
    }
  };

  const handleSaveChatHistory = async (chatHistory, updatedResult) => {
    if (!result || !result.id) return;
    
    // Call API to persist in MongoDB
    try {
      await updateAssessmentChat(result.id, chatHistory);
    } catch (err) {
      console.error("Failed to persist chat history:", err);
    }

    // Only update local state if we didn't already pass an updatedResult
    // (which means ChatView already updated the result state for us)
    if (!updatedResult) {
      setResult(prev => {
        if (!prev || prev.id !== result.id) return prev;
        return {
          ...prev,
          chat_history: chatHistory
        };
      });
    }
  };

  const handleSaveHourlyRate = async (rate) => {
    if (!result || !result.id) return;
    
    // Update local state first to keep state in sync
    setResult(prev => {
      if (!prev || prev.id !== result.id) return prev;
      return {
        ...prev,
        hourly_rate: rate
      };
    });
    
    // Call API to persist in MongoDB
    try {
      await updateAssessmentHourlyRate(result.id, rate);
    } catch (err) {
      console.error("Failed to persist hourly rate:", err);
    }
  };

  const handleAnalyzeText = async (text, context = null) => {
    setIsLoading(true);
    setError(null);
    setLastInput({ type: 'text', payload: text, context });
    try {
      const response = await analyzeText(text, context);
      setResult(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeFile = async (file, context = null, transcript = null) => {
    setIsLoading(true);
    setError(null);
    setLastInput({ type: 'file', payload: file, context, transcript });
    try {
      let response;
      if (context && transcript) {
        response = await analyzeText(transcript, context);
      } else {
        response = await analyzeFile(file);
      }
      setResult(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (lastInput.type === 'text') {
      handleAnalyzeText(lastInput.payload, lastInput.context);
    } else if (lastInput.type === 'file') {
      handleAnalyzeFile(lastInput.payload, lastInput.context, lastInput.transcript);
    }
  };

  // Interactive Mode handlers
  const handleStartInteractive = (type, payload) => {
    setPendingInputType(type);
    setPendingInputPayload(payload);
    setShowFollowUp(true);
  };

  const handleFollowUpComplete = (followupContext, transcript) => {
    setShowFollowUp(false);
    setIsLoading(true);
    setError(null);

    if (pendingInputType === 'text') {
      handleAnalyzeText(transcript || pendingInputPayload, followupContext);
    } else if (pendingInputType === 'file') {
      handleAnalyzeFile(pendingInputPayload, followupContext, transcript);
    }

    setPendingInputType(null);
    setPendingInputPayload(null);
  };

  const handleFollowUpCancel = () => {
    setShowFollowUp(false);
    setPendingInputType(null);
    setPendingInputPayload(null);
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setActiveTab('dashboard');
  };

  // Live Chat handlers
  const [liveChatKey, setLiveChatKey] = useState(0);
  const [liveChatResume, setLiveChatResume] = useState(false);

  const handleStartLiveChatRequest = (isResume = false) => {
    setPendingLiveChatResume(isResume);
    setShowLanguagePicker(true);
  };

  const handleConfirmLanguage = (language) => {
    setShowLanguagePicker(false);
    setLiveChatLanguage(language);
    setLiveChatKey(prev => prev + 1); // Force fresh mount
    setLiveChatResume(pendingLiveChatResume);
    setShowLiveChat(true);
  };

  const handleLiveChatComplete = (transcript) => {
    setShowLiveChat(false);
    // Clear the saved history in DB
    deleteLiveChatSession().catch(e => console.warn("Failed to delete session on complete", e));
    setHasSavedChat(false);
    handleAnalyzeText(transcript);
  };

  const handleLiveChatCancel = () => {
    setShowLiveChat(false);
    // Refresh the check to see if a session exists to resume
    checkSavedChatSession();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/[0.05] rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-cyan-600/[0.04] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        <Header onOpenHistory={() => setIsHistoryOpen(true)} onOpenApiKeys={() => setIsApiKeysOpen(true)} onOpenApiDocs={() => setIsApiDocsOpen(true)} user={user} onLogout={handleLogout} />

        <ApiKeysSettings isOpen={isApiKeysOpen} onClose={() => setIsApiKeysOpen(false)} onOpenDocs={() => { setIsApiKeysOpen(false); setIsApiDocsOpen(true); }} />

        <ApiDocs isOpen={isApiDocsOpen} onClose={() => setIsApiDocsOpen(false)} />

        <HistorySidebar 
          isOpen={isHistoryOpen} 
          onClose={() => setIsHistoryOpen(false)} 
          onLoadAssessment={(data) => {
            setResult(data);
            if (data.original_transcript) {
              setLastInput({ type: 'text', payload: data.original_transcript, context: null, transcript: null });
            } else {
              setLastInput({ type: null, payload: null, context: null, transcript: null });
            }
            setActiveTab('dashboard');
          }} 
        />

        <main className={`transition-all duration-300 mx-auto px-6 py-10 ${isAgentOpen ? 'max-w-[100%]' : 'max-w-7xl'}`}>

          {/* === LOADING OVERLAY === */}
          {isLoading && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md">
              <div className="w-12 h-12 border-3 border-slate-700 border-t-indigo-500 rounded-full mb-6"
                style={{ animation: 'spin 0.8s linear infinite' }} />
              <h3 className="text-xl font-bold text-white mb-2">Analyzing AP Process</h3>
              <p className="text-sm text-slate-400 text-center max-w-sm mb-8">
                Running 6-node AI pipeline with AlphaFold...
                <br />
                <span className="text-xs text-slate-500">It will take a moment to generate your report...</span>
              </p>
              <div className="flex flex-wrap justify-center gap-2 sm:gap-4 px-4">
                {['Extract', 'Structure', 'Score', 'Map', 'Summarize'].map((step, i) => (
                  <div key={step} className="flex flex-col items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full bg-indigo-500"
                      style={{ animation: `pulse-dot 1.8s ease-in-out ${i * 0.3}s infinite` }}
                    />
                    <span className="text-[10px] text-slate-500 font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === ERROR === */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
              style={{ animation: 'fade-in-up 0.3s ease-out forwards' }}>
              <strong className="text-red-400">Error:</strong> {error}
            </div>
          )}

          {/* === INPUT VIEW === */}
          {!result && !isLoading && (
            <div className="max-w-2xl mx-auto mt-8">
              {/* Hero */}
              <div className="text-center mb-12" style={{ animation: 'fade-in-up 0.6s ease-out forwards' }}>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-6">
                  <Cpu size={14} />
                  Powered by AlphaFold AI
                </div>
                <h2 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent mb-4">
                  AP Process Discovery
                </h2>
                <p className="text-base text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Upload an interview transcript, recording, or paste your AP process description.
                  AI will analyze and score it for automation readiness.
                </p>
              </div>

              <InputPanel
                onAnalyzeText={handleAnalyzeText}
                onAnalyzeFile={handleAnalyzeFile}
                onStartInteractive={handleStartInteractive}
                onStartLiveChat={handleStartLiveChatRequest}
                isLoading={isLoading}
                hasSavedChat={hasSavedChat}
              />

              {/* Feature highlights */}
              <div className="grid grid-cols-3 gap-6 mt-10">
                {[
                  { icon: <Mic size={20} className="text-indigo-400" />, label: 'Audio & Video', desc: 'Upload recordings for AI transcription' },
                  { icon: <BarChart3 size={20} className="text-cyan-400" />, label: 'ACS Scoring', desc: '3-axis automation feasibility scoring' },
                  { icon: <FileText size={20} className="text-amber-400" />, label: 'Full Report', desc: 'Downloadable Markdown assessment' },
                ].map((f, i) => (
                  <div
                    key={i}
                    className="text-center p-5 rounded-2xl border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.02] transition-all duration-300"
                    style={{ animation: `fade-in-up 0.5s ease-out ${0.3 + i * 0.1}s both` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center mx-auto mb-3">
                      {f.icon}
                    </div>
                    <div className="text-sm font-semibold text-white mb-1">{f.label}</div>
                    <div className="text-xs text-slate-500">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === RESULTS DASHBOARD === */}
          {result && !isLoading && (
            <div className="space-y-6">
              {/* Top bar */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4" style={{ animation: 'fade-in-up 0.4s ease-out forwards' }}>
                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white font-medium transition-colors group"
                  >
                    <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    New Assessment
                  </button>
                </div>

                <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 border border-white/5 w-full lg:w-auto overflow-x-auto shrink-0">
                  {[
                    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
                    { id: 'flow', label: 'Process Flow', icon: <Workflow size={15} /> },
                    { id: 'documents', label: 'PDD / SDD', icon: <BookOpen size={15} /> },
                    { id: 'report', label: 'Full Report', icon: <FileText size={15} /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === 'flow') setIsAgentOpen(false);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-6 mt-6 items-start relative">
                {/* Main Content Area */}
                <div className={`flex-1 w-full min-w-0 transition-all duration-300 ${isAgentOpen ? 'xl:pr-[420px]' : ''}`}>
                  <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
                    <SelectionCommentWrapper 
                      docType="dashboard"
                      onAddComment={(commentData) => {
                        setPendingDocEdits(prev => [...prev, commentData]);
                        setIsAgentOpen(true);
                      }}
                    >
                      <AudioOverview assessmentId={result.id} audioScripts={result.audio_scripts} />
                      <div className="space-y-6 mt-6">
                        <StatsCards data={result} />
                        <AnalyticsCharts 
                          data={result} 
                          onUpdateHourlyRate={handleSaveHourlyRate} 
                        />
                        <ExecutiveSummary summary={result.executive_summary} />
                        <ProcessMapTable scoredSteps={result.scored_steps} />
                        <OpportunityCards opportunities={result.opportunities} />
                        <NonAutomatedCards scoredSteps={result.scored_steps} />
                        <InsightsPanel
                          systems={result.systems_mentioned}
                          roles={result.roles_identified}
                          painPoints={result.pain_points}
                        />
                      </div>
                    </SelectionCommentWrapper>
                  </div>



                  <div className={activeTab === 'flow' ? 'block' : 'hidden'}>
                    <FlowchartView 
                      scoredSteps={result.scored_steps} 
                      initialXml={result.bpmn_xml || null}
                      assessmentId={result.id}
                      onSaveXml={handleSaveBpmnXml}
                    />
                  </div>

                  <div className={activeTab === 'report' ? 'block' : 'hidden'}>
                    <ReportView markdownReport={result.markdown_report} />
                  </div>

                  <div className={activeTab === 'documents' ? 'block' : 'hidden'}>
                    <DocumentView 
                      result={result} 
                      onUpdateResult={setResult} 
                      pendingDocEdits={pendingDocEdits}
                      setPendingDocEdits={setPendingDocEdits}
                      onAgentEditRequest={() => setIsAgentOpen(true)}
                    />
                  </div>
                </div>

                {/* Side Agent Panel */}
                {isAgentOpen && (
                  <div className="w-full max-w-[400px] fixed right-0 lg:right-6 top-24 bottom-6 overflow-hidden rounded-2xl shadow-2xl z-50 border border-slate-700/50 bg-white">
                    <ChatView 
                      result={result} 
                      onUpdateResult={setResult} 
                      onSaveChat={handleSaveChatHistory} 
                      onClose={() => setIsAgentOpen(false)}
                      pendingDocEdits={pendingDocEdits}
                      setPendingDocEdits={setPendingDocEdits}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Floating Agent Toggle Button */}
        {result && !isAgentOpen && activeTab !== 'flow' && (
          <button
            onClick={() => setIsAgentOpen(true)}
            className="fixed bottom-8 right-8 z-50 flex items-center justify-center w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-600/30 transition-transform hover:scale-105"
            title="Ask Agent"
          >
            <MessageSquare size={24} />
          </button>
        )}

        {/* Footer */}
        <footer className="border-t border-white/5 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            <p className="text-xs text-slate-600">
              AlphaFold — AP Process Discovery Agent
            </p>
            <p className="text-xs text-slate-600">
              AuxiLab © 2026
            </p>
          </div>
        </footer>
      </div>

      {/* ── Required Facts Modal ───────────────────────────────── */}
      {result && !isLoading && !showFollowUp && !dismissedFacts &&
        result.missing_critical_facts && result.missing_critical_facts.length > 0 && (
        <RequiredFactsModal
          missingFacts={result.missing_critical_facts}
          onProvide={() => {
            setDismissedFacts(true);
            if (result.original_transcript) {
              handleStartInteractive('text', result.original_transcript);
            }
          }}
          onContinue={() => setDismissedFacts(true)}
        />
      )}

      {/* ── Interactive Follow-Up Chat Overlay ─────────────────── */}
      {showFollowUp && (
        <FollowUpChat
          inputType={pendingInputType}
          inputPayload={pendingInputPayload}
          onComplete={handleFollowUpComplete}
          onCancel={handleFollowUpCancel}
        />
      )}

      {/* ── Live Chat Overlay ──────────────────────────────────── */}
      <LanguagePicker
        isOpen={showLanguagePicker}
        isResume={pendingLiveChatResume}
        defaultLanguage={pendingLiveChatResume ? savedChatLanguage : 'English'}
        onConfirm={handleConfirmLanguage}
        onCancel={() => setShowLanguagePicker(false)}
      />

      {showLiveChat && (
        <LiveChat
          key={liveChatKey}
          isResume={liveChatResume}
          language={liveChatLanguage}
          onComplete={handleLiveChatComplete}
          onCancel={handleLiveChatCancel}
        />
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={
        <ProtectedRoute setUser={setUser}>
          <Dashboard user={user} />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
