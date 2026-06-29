import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  ArrowRight,
  X,
  MessageSquareMore,
  Sparkles,
  CheckCircle2,
  SkipForward,
  FastForward,
} from "lucide-react";
import {
  generateFollowUpQuestions,
  submitFollowUpAnswers,
} from "../services/api";

export default function FollowUpChat({
  inputType,
  inputPayload,
  onComplete,
  onCancel,
}) {
  // inputType: 'text' | 'file'
  // inputPayload: the text string or File object
  // onComplete: (followupContext, transcript) => void  — called when user is ready to analyze
  // onCancel: () => void  — go back to input

  const [phase, setPhase] = useState("loading"); // 'loading' | 'chatting' | 'submitting-answers' | 'proceeding'
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState([]); // { role: 'agent'|'user', content: string }
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { questionIndex: answer }
  const [conversation, setConversation] = useState([]); // accumulated Q&A pairs
  const [round, setRound] = useState(0);
  const [error, setError] = useState(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const MAX_ROUNDS = 3;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase]);

  // Focus input when question changes
  useEffect(() => {
    if (phase === "chatting") {
      inputRef.current?.focus();
    }
  }, [activeQuestionIdx, phase]);

  // Initial load — generate follow-up questions
  useEffect(() => {
    let cancelled = false;

    const loadQuestions = async () => {
      try {
        setPhase("loading");
        setError(null);

        let response;
        if (inputType === "text") {
          response = await generateFollowUpQuestions(inputPayload, null);
        } else {
          response = await generateFollowUpQuestions(null, inputPayload);
        }

        if (cancelled) return;

        const { questions, transcript: extractedTranscript } = response.data;
        setTranscript(extractedTranscript);
        setCurrentQuestions(questions);
        setRound(1);

        // Add agent message with all questions
        const agentMsg = {
          role: "agent",
          content: `I've reviewed your transcript and have a few questions to ensure I can provide the most accurate automation analysis. Let me ask them one by one.`,
          type: "intro",
        };

        setMessages([agentMsg]);
        setActiveQuestionIdx(0);
        setPhase("chatting");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase("loading");
        }
      }
    };

    loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [inputType, inputPayload]);

  // Shared round-completion logic — used after answering or skipping the last question.
  const finishRound = async (convo) => {
    if (round < MAX_ROUNDS && convo.length > 0) {
      setPhase("submitting-answers");
      try {
        const response = await submitFollowUpAnswers(transcript, convo);
        const { satisfied, questions: newQuestions } = response.data;

        if (satisfied || !newQuestions || newQuestions.length === 0) {
          // Agent is satisfied — show proceed state
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: `Great, thank you for the clarifications! I now have enough context for a thorough analysis. Click **"Proceed to Analysis"** when you're ready.`,
              type: "satisfied",
            },
          ]);
          setPhase("chatting");
        } else {
          // More questions from agent
          setCurrentQuestions(newQuestions);
          setActiveQuestionIdx(0);
          setRound((prev) => prev + 1);
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: `Thanks for those answers! I have ${newQuestions.length} more quick question${newQuestions.length > 1 ? "s" : ""} to refine the analysis further.`,
              type: "intro",
            },
          ]);
          setPhase("chatting");
        }
      } catch (err) {
        setError(err.message);
        setPhase("chatting");
      }
    } else {
      // Max rounds reached, or nothing was answered this round
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content:
            convo.length === 0
              ? `No problem — I'll work with the transcript as provided. Click **"Proceed to Analysis"** whenever you're ready.`
              : `Excellent! I've gathered comprehensive context through ${round} round${round > 1 ? "s" : ""} of questions. Click **"Proceed to Analysis"** to run the enriched assessment.`,
          type: "satisfied",
        },
      ]);
      setPhase("chatting");
    }
  };

  const handleAnswerSubmit = async (e) => {
    e?.preventDefault();
    if (!currentAnswer.trim() || phase !== "chatting") return;

    const question = currentQuestions[activeQuestionIdx];
    const answer = currentAnswer.trim();

    // Add Q&A to messages
    const questionMsg = {
      role: "agent",
      content: question,
      type: "question",
      questionNum: activeQuestionIdx + 1,
      totalQuestions: currentQuestions.length,
    };
    const answerMsg = { role: "user", content: answer };

    // Update conversation
    const newConversation = [...conversation, { question, answer }];
    setConversation(newConversation);
    setCurrentAnswer("");

    setMessages((prev) => [...prev, questionMsg, answerMsg]);

    // Advance to the next question, or finish the round
    const nextIdx = activeQuestionIdx + 1;
    if (nextIdx < currentQuestions.length) {
      setActiveQuestionIdx(nextIdx);
    } else {
      await finishRound(newConversation);
    }
  };

  // Skip only the current question. Skipped questions are not sent to the analysis.
  const handleSkipQuestion = async () => {
    if (phase !== "chatting" || activeQuestionIdx >= currentQuestions.length)
      return;

    const question = currentQuestions[activeQuestionIdx];
    const questionMsg = {
      role: "agent",
      content: question,
      type: "question",
      questionNum: activeQuestionIdx + 1,
      totalQuestions: currentQuestions.length,
    };
    const skippedMsg = { role: "user", content: "Skipped", type: "skipped" };

    setCurrentAnswer("");
    setMessages((prev) => [...prev, questionMsg, skippedMsg]);

    const nextIdx = activeQuestionIdx + 1;
    if (nextIdx < currentQuestions.length) {
      setActiveQuestionIdx(nextIdx);
    } else {
      setActiveQuestionIdx(nextIdx);
      if (conversation.length > 0) {
        await finishRound(conversation);
      } else {
        handleProceed();
      }
    }
  };

  // Skip all remaining questions and go straight to the analysis.
  const handleSkipAll = () => {
    if (phase !== "chatting") return;
    setActiveQuestionIdx(currentQuestions.length);
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        content: `No problem — skipping the remaining questions and running the analysis with the information provided so far.`,
        type: "satisfied",
      },
    ]);
    handleProceed();
  };

  const handleProceed = () => {
    setPhase("proceeding");

    // Build the follow-up context string
    let followupContext = "=== Follow-Up Discovery Session ===\n\n";
    for (const qa of conversation) {
      followupContext += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
    }
    followupContext += "=== End of Follow-Up Session ===\n";

    onComplete(followupContext, transcript);
  };

  const allQuestionsAnswered =
    activeQuestionIdx >= currentQuestions.length - 1 &&
    currentAnswer === "" &&
    conversation.length > 0 &&
    phase === "chatting";
  const canProceed = conversation.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl"
      style={{ animation: "fade-in-up 0.4s ease-out forwards" }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-violet-600/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-cyan-600/[0.04] rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-3xl mx-auto h-[85vh] flex flex-col rounded-3xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center">
              <MessageSquareMore size={20} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Interactive Discovery
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-[10px] font-bold uppercase tracking-wider">
                  Round {round}/{MAX_ROUNDS}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Agent is asking follow-up questions for a deeper analysis
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
            title="Cancel and go back"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Loading State */}
          {phase === "loading" && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping"
                  style={{ animationDuration: "2s" }}
                />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Bot size={28} className="text-violet-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  Reading your transcript...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Agent is analyzing and preparing follow-up questions
                </p>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400"
                    style={{
                      animation: `pulse-dot 1.4s infinite ease-in-out ${i * 0.2}s both`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm max-w-md text-center">
                <strong className="text-red-400">Error:</strong> {error}
              </div>
              <button
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Go Back
              </button>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              style={{ animation: "fade-in-up 0.3s ease-out forwards" }}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-indigo-500 text-white"
                    : "bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 text-violet-400"
                }`}
              >
                {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
              </div>

              {/* Bubble */}
              <div
                className={`px-4 py-3 rounded-2xl max-w-[80%] ${
                  msg.role === "user"
                    ? msg.type === "skipped"
                      ? "bg-slate-700/40 text-slate-400 italic rounded-tr-sm"
                      : "bg-indigo-500/90 text-white rounded-tr-sm"
                    : msg.type === "question"
                      ? "bg-slate-800/80 border border-violet-500/20 text-slate-200 rounded-tl-sm"
                      : msg.type === "satisfied"
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 rounded-tl-sm"
                        : "bg-slate-800/60 border border-white/[0.06] text-slate-300 rounded-tl-sm"
                }`}
              >
                {msg.type === "question" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-bold">
                      Q{msg.questionNum}/{msg.totalQuestions}
                    </span>
                  </div>
                )}
                {msg.type === "satisfied" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Ready
                    </span>
                  </div>
                )}
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Current Question (not yet in messages) */}
          {phase === "chatting" &&
            activeQuestionIdx < currentQuestions.length && (
              <div
                className="flex gap-3"
                style={{ animation: "fade-in-up 0.3s ease-out forwards" }}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5 text-violet-400">
                  <Bot size={14} />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] bg-slate-800/80 border border-violet-500/20 text-slate-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-bold">
                      Q{activeQuestionIdx + 1}/{currentQuestions.length}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {currentQuestions[activeQuestionIdx]}
                  </p>
                </div>
              </div>
            )}

          {/* Submitting Answers Loading */}
          {phase === "submitting-answers" && (
            <div
              className="flex gap-3"
              style={{ animation: "fade-in-up 0.3s ease-out forwards" }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5 text-violet-400">
                <Bot size={14} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-slate-800/60 border border-white/[0.06] flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full bg-violet-400"
                  style={{
                    animation: "pulse-dot 1.4s infinite ease-in-out both",
                  }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-violet-400"
                  style={{
                    animation: "pulse-dot 1.4s infinite ease-in-out 0.2s both",
                  }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-violet-400"
                  style={{
                    animation: "pulse-dot 1.4s infinite ease-in-out 0.4s both",
                  }}
                />
              </div>
            </div>
          )}

          {/* Proceeding state */}
          {phase === "proceeding" && (
            <div
              className="flex gap-3"
              style={{ animation: "fade-in-up 0.3s ease-out forwards" }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400">
                <Sparkles size={14} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                <Loader2 size={16} className="text-emerald-400 animate-spin" />
                <p className="text-sm text-emerald-300 font-medium">
                  Starting enriched analysis pipeline...
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input / Action Area */}
        <div className="px-6 py-4 border-t border-white/[0.06] bg-slate-900/80 shrink-0">
          {phase === "chatting" &&
            activeQuestionIdx < currentQuestions.length && (
              <form onSubmit={handleAnswerSubmit} className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800/60 border border-white/[0.06] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 transition-all"
                />
                <button
                  type="submit"
                  disabled={!currentAnswer.trim()}
                  className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-all shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Send size={18} />
                </button>
              </form>
            )}

          {/* Skip controls */}
          {phase === "chatting" &&
            activeQuestionIdx < currentQuestions.length && (
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSkipQuestion}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-colors"
                  title="Skip this question"
                >
                  <SkipForward size={13} />
                  Skip question
                </button>
                <button
                  type="button"
                  onClick={handleSkipAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-colors"
                  title="Skip all remaining questions and run the analysis"
                >
                  <FastForward size={13} />
                  Skip all & analyze
                </button>
              </div>
            )}

          {/* Proceed / Skip buttons */}
          {phase === "chatting" && canProceed && (
            <div
              className={`flex items-center gap-3 ${activeQuestionIdx < currentQuestions.length ? "mt-3" : ""}`}
            >
              <button
                onClick={handleProceed}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
              >
                <Sparkles size={16} />
                Proceed to Analysis
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {phase === "chatting" &&
            !canProceed &&
            activeQuestionIdx >= currentQuestions.length && (
              <p className="text-xs text-slate-500 text-center">
                The agent is evaluating your answers...
              </p>
            )}

          {(phase === "loading" ||
            phase === "submitting-answers" ||
            phase === "proceeding") && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin text-violet-400" />
              {phase === "loading"
                ? "Generating questions..."
                : phase === "proceeding"
                  ? "Starting analysis..."
                  : "Processing answers..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
