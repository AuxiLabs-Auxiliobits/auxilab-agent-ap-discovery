import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, User, MessageSquare, Pencil, HelpCircle, Mic, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useMicRecorder from '../hooks/useMicRecorder';
import { chatWithAgent } from '../services/api';

/**
 * Cleans up the assistant's reply BEFORE handing it to ReactMarkdown so that
 * markdown tokens (#, **, ---, lists, tables) actually render as formatting
 * instead of showing as literal text.
 *
 * The model occasionally:
 *   - Wraps the entire reply in ```markdown / ```md / ```text fences,
 *     which makes ReactMarkdown render the inside as a verbatim code block.
 *   - Backslash-escapes markdown chars (\#, \*\*, \-, \|) when it thinks
 *     it's quoting them.
 *   - Indents lines with 4+ leading spaces, which CommonMark treats as a
 *     code block.
 *   - Uses CRLF line endings or Windows quotes that break GFM tables.
 *
 * This normaliser undoes all of that.
 */
function normalizeAssistantMarkdown(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw;

  // 1. Normalise line endings.
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Strip EVERY ```markdown / ```md / ```text / ```plain fence anywhere
  //    in the message. The model frequently emits prose first, then wraps
  //    the actual markdown answer inside a ```markdown fence — which
  //    ReactMarkdown then renders as a verbatim code block (raw #, **, ---).
  //    These fences are never useful in chat output, so we always unwrap.
  //    Real code blocks (```python / ```js / ```bash / ```sql / ```bpmn /
  //    plain ```) are NOT touched, so syntax-highlighted snippets still
  //    render as code.
  s = s.replace(
    /```(?:markdown|md|text|plain)\s*\n?([\s\S]*?)\n?```/gi,
    (_, inner) => '\n\n' + inner.trim() + '\n\n'
  );

  // 3. Strip a single OUTER plain ``` fence (no language hint) that wraps
  //    the entire reply — happens when the whole answer is double-fenced.
  const outerPlain = s.match(/^\s*```\s*\n([\s\S]*?)\n```\s*$/);
  if (outerPlain) {
    s = outerPlain[1];
  }

  // 4. Remove backslash-escaped markdown punctuation. The model sometimes
  //    emits \# / \*\* / \- / \| when it thinks it's quoting them.
  s = s.replace(/\\([#*_`~\-|>[\](){}!])/g, '$1');

  // 5. Strip a uniform 4-space (or 1-tab) leading indent across the whole
  //    message — CommonMark would interpret it as a code block. We only
  //    strip if the FIRST non-empty line is indented; this preserves
  //    intentional code blocks the model produces inline.
  const lines = s.split('\n');
  const firstNonEmpty = lines.find(l => l.trim().length > 0);
  if (firstNonEmpty && /^(?: {4}|\t)/.test(firstNonEmpty)) {
    const allIndented = lines.every(l => l.length === 0 || /^(?: {4}|\t)/.test(l));
    if (allIndented) {
      s = lines.map(l => l.replace(/^(?: {4}|\t)/, '')).join('\n');
    }
  }

  // 6. Make sure headings and horizontal rules aren't glued to the previous
  //    line — CommonMark needs a blank line before them in some contexts.
  s = s.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  s = s.replace(/([^\n])\n(---+)\s*\n/g, '$1\n\n$2\n\n');

  // 7. Collapse 3+ blank lines (introduced by step 2) to just 2.
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

export default function ChatView({ result, onUpdateResult, onSaveChat, onClose, pendingDocEdits = [], setPendingDocEdits }) {
  const defaultWelcome = { 
    role: 'assistant', 
    content: "Hello! I'm your AP Automation Consultant. You can ask me questions about your analysis, or instruct me to make updates and changes to your Full Report directly." 
  };

  const [messages, setMessages] = useState(
    result.chat_history && result.chat_history.length > 0 
      ? result.chat_history 
      : [defaultWelcome]
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Mic recorder — on transcription complete, fill the input field
  const handleMicTranscription = useCallback((transcribedText) => {
    setInput(prev => prev ? prev + ' ' + transcribedText : transcribedText);
  }, []);
  const mic = useMicRecorder(handleMicTranscription);

  // Sync messages when loading a different assessment
  const lastAssessmentIdRef = useRef(result.id);
  useEffect(() => {
    if (lastAssessmentIdRef.current !== result.id) {
      lastAssessmentIdRef.current = result.id;
      setMessages(
        result.chat_history && result.chat_history.length > 0 
          ? result.chat_history 
          : [defaultWelcome]
      );
    } else if (result.chat_history && messages.length !== result.chat_history.length) {
      // Sync if parent updates chat history from outside (e.g. initial load delay)
      setMessages(result.chat_history);
    }
  }, [result.id, result.chat_history]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!input.trim() && pendingDocEdits.length === 0) || isLoading) return;

    // Use a placeholder message if user only submits pending edits without text
    const messageContent = input.trim() || "Please apply the pending document edits.";
    const userMessage = { role: 'user', content: messageContent };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const data = await chatWithAgent(result, newMessages, pendingDocEdits);

      if (data.status === 'success' && data.data) {
        const replyMessage = { role: 'assistant', content: data.data.response_text };
        const updatedMessages = [...newMessages, replyMessage];
        
        // Handle report update if the agent chose to update it
        let updatedResult = { ...result };
        let stateChanged = false;

        if (data.data.updated_context_data) {
           updatedResult = data.data.updated_context_data;
           stateChanged = true;
        }

        if (data.data.updated_document) {
           const { type, content } = data.data.updated_document;
           updatedResult = {
             ...updatedResult,
             documents: {
               ...(updatedResult.documents || {}),
               [type]: content
             }
           };
           stateChanged = true;
        }

        if (stateChanged) {
           const successMessage = { 
             role: 'assistant', 
             content: "✅ **Success:** I have applied your updates!" 
           };
           const finalMessages = [...updatedMessages, successMessage];
           setMessages(finalMessages);
           
           updatedResult.chat_history = finalMessages;
           onUpdateResult(updatedResult);
           onSaveChat?.(finalMessages, updatedResult);
           if (setPendingDocEdits) setPendingDocEdits([]);
        } else {
           setMessages(updatedMessages);
           onSaveChat?.(updatedMessages);
           if (setPendingDocEdits && pendingDocEdits.length > 0) setPendingDocEdits([]);
        }
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      const errorMessage = { role: 'assistant', content: `**Error:** ${err.message}` };
      const finalMessages = [...newMessages, errorMessage];
      setMessages(finalMessages);
      onSaveChat?.(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg" style={{ animation: 'fade-in-up 0.5s ease-out 0.2s both' }}>
      <div className="h-16 border-b border-slate-200 bg-slate-50 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-indigo-100 text-indigo-600">
            <Bot size={16} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Ask Agent</h3>
            <p className="text-xs text-slate-500">AP Automation Consultant</p>
          </div>
        </div>

        {/* Close Button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors ml-2"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-slate-50/50 space-y-4 min-w-0">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 w-full min-w-0 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-slate-800 text-white' 
                : 'bg-white border border-slate-200 text-indigo-600'
            }`}>
              {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
            </div>
            
            {/* Message Bubble — min-w-0 lets flex shrink below content size,
                max-w-full caps to panel width, break-words / overflow-wrap-anywhere
                forces long unbreakable strings (URLs, paths, code) to wrap. */}
            <div className={`px-5 py-3 rounded-2xl shadow-sm min-w-0 max-w-[calc(100%-3.25rem)] break-words ${
              msg.role === 'user' 
                ? 'bg-slate-800 text-white rounded-tr-sm' 
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
            }`} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {msg.role === 'user' ? (
                <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
              ) : (
                <div
                  className="prose prose-sm prose-slate max-w-none break-words
                             prose-headings:text-slate-800 prose-headings:mt-3 prose-headings:mb-2
                             prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                             prose-p:my-2 prose-p:leading-relaxed
                             prose-a:text-indigo-600 prose-a:break-all
                             prose-strong:text-slate-900 prose-strong:font-semibold
                             prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                             prose-hr:my-3
                             prose-pre:bg-slate-100 prose-pre:text-slate-800 prose-pre:my-2
                             prose-pre:p-2 prose-pre:rounded-md prose-pre:text-xs"
                  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Wrap long lines instead of horizontal-scrolling
                      pre: ({ node, children, ...props }) => (
                        <pre
                          className="whitespace-pre-wrap break-words overflow-x-auto"
                          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                          {...props}
                        >
                          {children}
                        </pre>
                      ),
                      code: ({ inline, className, children, ...props }) =>
                        inline ? (
                          <code
                            className="px-1 py-0.5 bg-slate-100 text-rose-600 rounded text-[12px] break-words"
                            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            {...props}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            className="block whitespace-pre-wrap break-words text-xs"
                            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            {...props}
                          >
                            {children}
                          </code>
                        ),
                      // Tables get their own horizontal-scroll container so they
                      // never blow up the bubble width.
                      table: ({ children, ...props }) => (
                        <div className="overflow-x-auto -mx-1 my-2">
                          <table className="text-xs" {...props}>{children}</table>
                        </div>
                      ),
                      // Long links break across lines instead of overflowing.
                      a: ({ children, href, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 underline break-all"
                          {...props}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {normalizeAssistantMarkdown(msg.content)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 w-full">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1 text-indigo-600">
              <Bot size={18} />
            </div>
            <div className="px-6 py-4 rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out both' }} />
              <div className="w-2 h-2 rounded-full bg-indigo-400" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out 0.2s both' }} />
              <div className="w-2 h-2 rounded-full bg-indigo-400" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out 0.4s both' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t bg-white p-4 shrink-0 transition-colors border-indigo-100 flex flex-col gap-2">
        {/* Pending Edits List */}
        {pendingDocEdits.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 max-h-32 overflow-y-auto">
            {pendingDocEdits.map((edit, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs max-w-full">
                <span className="font-semibold text-indigo-700 whitespace-nowrap">{edit.docType.toUpperCase()}:</span>
                <span className="text-indigo-600 truncate flex-1" title={`"${edit.selectedText}" - ${edit.comment}`}>
                  "{edit.selectedText}"
                </span>
                <button 
                  onClick={() => setPendingDocEdits(prev => prev.filter((_, i) => i !== idx))}
                  className="text-indigo-400 hover:text-indigo-600 ml-1 flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {mic.isTranscribing ? (
          /* Transcribing State */
          <div className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Loader2 size={18} className="animate-spin text-indigo-500" />
            <span className="text-sm text-slate-500 font-medium">Transcribing...</span>
          </div>
        ) : mic.isRecording ? (
          /* Recording State */
          <div className="w-full flex items-center gap-2">
            <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
              <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-sm font-mono font-bold text-rose-600">{mic.formattedDuration}</span>
              <span className="text-xs text-rose-400 truncate">Recording... Speak now</span>
            </div>
            <button
              type="button"
              onClick={mic.cancelRecording}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
              title="Cancel recording"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={mic.stopRecording}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm shrink-0"
              title="Stop & transcribe"
            >
              <Square size={16} className="fill-current" />
            </button>
          </div>
        ) : (
          /* Normal Input State */
          <form onSubmit={handleSubmit} className="w-full flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or instruct the AI to update your report..."
              className="flex-1 px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 shadow-sm transition-all border-slate-300 focus:ring-indigo-500/50 focus:border-indigo-500 text-slate-800 placeholder-slate-400"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={mic.startRecording}
              disabled={isLoading}
              className="flex items-center justify-center w-12 h-12 rounded-xl border transition-colors shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
              title="Record voice message"
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && pendingDocEdits.length === 0)}
              className="flex items-center justify-center w-12 h-12 rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shrink-0 bg-indigo-600 hover:bg-indigo-700"
            >
              <Send size={18} className={(input.trim() || pendingDocEdits.length > 0) && !isLoading ? 'translate-x-0.5 -translate-y-0.5 transition-transform' : ''} />
            </button>
          </form>
        )}

        {/* Mic error display */}
        {mic.error && (
          <div className="w-full mt-2 p-2 rounded-lg bg-red-50 border border-red-100 text-red-500 text-[11px] font-medium text-center">
            {mic.error}
          </div>
        )}
      </div>
    </div>
  );
}
