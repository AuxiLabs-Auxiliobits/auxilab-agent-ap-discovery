import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  Suspense,
} from "react";
import { Loader2, Bot, X, Mic, MicOff, PhoneOff, Sparkles } from "lucide-react";
import {
  saveLiveChatSession,
  getLiveChatSession,
  deleteLiveChatSession,
  prepareLiveChatResume,
} from "../services/api";

const Avatar3D = React.lazy(() => import("./Avatar3D"));

/* ── Emotion Detection ─────────────────────────────────────────
   Analyzes AI transcript text for emotional cues and returns
   an emotion string: 'neutral' | 'happy' | 'empathetic' | 'surprised' | 'thinking'
   Designed to be fast (keyword scoring) — runs on every text chunk.
   ──────────────────────────────────────────────────────────── */

const EMOTION_KEYWORDS = {
  happy: [
    "great",
    "excellent",
    "wonderful",
    "fantastic",
    "awesome",
    "perfect",
    "amazing",
    "glad",
    "happy",
    "exciting",
    "brilliant",
    "terrific",
    "well done",
    "good job",
    "nice work",
    "love that",
    "absolutely",
    "beautiful",
    "impressive",
    "outstanding",
    "superb",
    "thank you",
    "sounds good",
    "exactly",
    "that's right",
    "perfect sense",
  ],
  empathetic: [
    "sorry",
    "understand",
    "difficult",
    "challenging",
    "frustrating",
    "tough",
    "unfortunately",
    "concerned",
    "worry",
    "issue",
    "problem",
    "struggle",
    "pain point",
    "bottleneck",
    "tricky",
    "complex",
    "can see how",
    "makes sense why",
    "must be",
    "appreciate",
    "hear you",
    "i see",
    "that sounds",
    "i can imagine",
  ],
  surprised: [
    "wow",
    "oh really",
    "interesting",
    "fascinating",
    "surprising",
    "remarkable",
    "incredible",
    "didn't expect",
    "that's new",
    "no way",
    "wait",
    "hold on",
    "actually",
    "oh my",
    "oh wow",
    "quite unique",
    "never heard",
    "unusual",
    "unexpected",
  ],
  thinking: [
    "let me think",
    "hmm",
    "consider",
    "wondering",
    "curious",
    "what if",
    "how about",
    "perhaps",
    "maybe",
    "let's see",
    "so basically",
    "in other words",
    "if i understand",
    "so what you",
    "could you clarify",
    "tell me more",
    "can you explain",
    "walk me through",
    "help me understand",
    "elaborate",
  ],
};

function detectEmotion(text) {
  if (!text || text.length < 5) return "neutral";

  // Focus on the most recent ~200 characters for relevance
  const recent = text.slice(-250).toLowerCase();

  const scores = { happy: 0, empathetic: 0, surprised: 0, thinking: 0 };

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (recent.includes(kw)) scores[emotion] += 1;
    }
  }

  // Exclamation marks boost happy/surprised
  const exclamations = (recent.match(/!/g) || []).length;
  if (exclamations > 0) {
    scores.happy += exclamations * 0.4;
    scores.surprised += exclamations * 0.2;
  }

  // Questions at the end boost thinking
  if (recent.trimEnd().endsWith("?")) {
    scores.thinking += 0.6;
  }

  // Find highest scoring emotion
  let topEmotion = "neutral";
  let topScore = 0.8; // minimum threshold to trigger a non-neutral emotion
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topEmotion = emotion;
    }
  }

  return topEmotion;
}

function AvatarLoading() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 size={28} className="text-violet-400 animate-spin" />
    </div>
  );
}

/* ── Speaking wave animation ────────────────────────────────── */
function SpeakingWave({ isActive }) {
  if (!isActive) return null;
  return (
    <div className="flex items-center gap-[3px] h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-violet-400"
          style={{
            animation: `speak-wave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
            height: "40%",
          }}
        />
      ))}
      <style>{`@keyframes speak-wave { 0% { height: 20%; } 100% { height: 100%; } }`}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN LIVECHAT COMPONENT — WebSocket Multimodal Live API
   ══════════════════════════════════════════════════════════════ */

export default function LiveChat({
  isResume = false,
  language = "English",
  onComplete,
  onCancel,
}) {
  // Core state
  const [phase, setPhase] = useState(isResume ? "preparing" : "connecting"); // 'preparing' | 'connecting' | 'connected' | 'error' | 'completing'
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [statusText, setStatusText] = useState("Connecting to Aria...");
  const [avatarEmotion, setAvatarEmotion] = useState("neutral");
  // NEW-CHAT GREETING: while true, Aria waves her hand. Mic stays off until the
  // greeting finishes, then it auto-enables. (Resume chats are unaffected.)
  const [isWaving, setIsWaving] = useState(false);

  // phaseRef mirrors phase state for use inside WS closures where state is stale
  const phaseRef = useRef("connecting");
  const setPhaseWithRef = (newPhase) => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  };

  // Refs for WebSockets and Audio
  const isAliveRef = useRef(true);
  const isListeningRef = useRef(false); // mirror of isListening for use in closures
  const isSpeakingRef = useRef(false); // mirror of isSpeaking for use in closures to prevent echo loops
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const messagesEndRef = useRef(null);
  // Playback queue management
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  // Transcript references
  const currentAiTextRef = useRef("");
  const currentUserTextRef = useRef("");
  const messagesRef = useRef([]);
  const isInitialResumeSilentRef = useRef(isResume);
  // True once the new-chat greeting turn has completed (so we only auto-unlock once).
  const greetingDoneRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length === 0) return;

    // Debounce database save by 1.5 seconds to avoid spamming requests
    const timer = setTimeout(() => {
      saveLiveChatSession(messages, language).catch((e) =>
        console.warn("Failed to save session to DB", e),
      );
    }, 1500);

    return () => clearTimeout(timer);
  }, [messages, language]);

  // Helper: immediately persist a snapshot of all messages to DB (called after each complete AI turn)
  const persistNow = useCallback(
    (msgs) => {
      if (msgs.length === 0) return;
      saveLiveChatSession(msgs, language).catch((e) =>
        console.warn("Immediate session save failed", e),
      );
    },
    [language],
  );
  // Keep isListeningRef in sync with isListening state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  // Keep isSpeakingRef in sync with isSpeaking state
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
  // Fade the avatar's emotion back to neutral only AFTER she stops speaking
  // (not mid-sentence). This keeps the expression alive for the whole reply.
  useEffect(() => {
    if (isSpeaking) return undefined;
    const id = setTimeout(() => setAvatarEmotion("neutral"), 1500);
    return () => clearTimeout(id);
  }, [isSpeaking]);
  // Stop the greeting hand-wave once Aria has finished speaking the greeting.
  useEffect(() => {
    if (!isSpeaking && greetingDoneRef.current) setIsWaving(false);
  }, [isSpeaking]);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Audio Playback ──────────────────────────────────────────
  const playAudioChunk = useCallback((base64PCM) => {
    if (!audioContextRef.current) return;
    // Try to resume AudioContext if it was suspended by browser autoplay policy
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current
        .resume()
        .catch((e) =>
          console.warn("Could not resume AudioContext before playback:", e),
        );
    }
    try {
      const binaryStr = window.atob(base64PCM);
      const buffer = new ArrayBuffer(binaryStr.length);
      const view = new DataView(buffer);
      for (let i = 0; i < binaryStr.length; i++) {
        view.setUint8(i, binaryStr.charCodeAt(i));
      }
      const int16Array = new Int16Array(buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        float32Array.length,
        24000,
      );
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      // Route through the analyser (for avatar lip-sync) when available.
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      } else {
        source.connect(audioContextRef.current.destination);
      }

      const currentTime = audioContextRef.current.currentTime;
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime;
      }

      // Synchronously set isSpeakingRef to true right before starting playback to prevent mic recording the AI voice
      isSpeakingRef.current = true;

      source.start(nextPlayTimeRef.current);
      activeSourcesRef.current.push(source);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(
          (s) => s !== source,
        );
        if (activeSourcesRef.current.length === 0) {
          setIsSpeaking(false);
          isSpeakingRef.current = false; // Synchronously release mic lock
          currentAiTextRef.current = "";
        }
      };

      nextPlayTimeRef.current += audioBuffer.duration;
      setIsSpeaking(true);
      isInitialResumeSilentRef.current = false; // Release initial silence lock
      setStatusText("AI is speaking...");
    } catch (e) {
      console.error("Error playing audio chunk", e);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setIsSpeaking(false);
    isSpeakingRef.current = false; // Synchronously release mic lock
  }, []);

  const connectionIdRef = useRef(0);

  // ── WebSocket and Audio Capture Setup ────────────────────────
  const connectAndStart = useCallback(
    async (myConnectionId) => {
      try {
        setPhase("connecting");
        setStatusText("Requesting microphone...");

        // 1. Get Microphone at 16kHz
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        // If a newer connection attempt started, abort this one
        if (connectionIdRef.current !== myConnectionId || !isAliveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        let audioCtx;
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000,
          });
        } catch (e) {
          console.warn(
            "Could not create AudioContext at 16000Hz, falling back to default sample rate:",
            e,
          );
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        audioContextRef.current = audioCtx;

        // Tap an AnalyserNode off playback so the 3D avatar can lip-sync to Aria's voice.
        try {
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          analyser.connect(audioCtx.destination);
          analyserRef.current = analyser;
        } catch (e) {
          console.warn("Could not create AnalyserNode for avatar lip-sync:", e);
          analyserRef.current = null;
        }

        if (audioCtx.state === "suspended") {
          audioCtx
            .resume()
            .catch((e) =>
              console.warn("Failed to resume AudioContext on creation:", e),
            );
        }

        const source = audioCtx.createMediaStreamSource(stream);

        await audioCtx.audioWorklet.addModule("/pcm-processor.js");

        if (connectionIdRef.current !== myConnectionId || !isAliveRef.current) {
          return;
        }

        const processor = new AudioWorkletNode(audioCtx, "pcm-processor");
        scriptProcessorRef.current = processor;

        // 2. Connect WebSocket
        setStatusText("Connecting...");

        // Ping the auth check endpoint first. If the token is expired,
        // checkAuth will automatically refresh the HttpOnly cookie!
        try {
          const { checkAuth } = await import("../services/api.js");
          await checkAuth();
        } catch (e) {
          console.warn("Auth check failed before WS connection", e);
          if (connectionIdRef.current === myConnectionId) {
            setError("Session expired. Please log in again.");
            setPhase("error");
          }
          return;
        }

        if (connectionIdRef.current !== myConnectionId || !isAliveRef.current) {
          return;
        }

        const token = sessionStorage.getItem('access_token') || "";
        const langParam = encodeURIComponent(language);
        let wsUrl = "";

        const backendApiUrl = import.meta.env.VITE_API_URL;
        if (backendApiUrl) {
          const cleanUrl = backendApiUrl.replace(/^(http|https):\/\//, "");
          const wsProtocol = backendApiUrl.startsWith("https") ? "wss:" : "ws:";
          wsUrl = `${wsProtocol}//${cleanUrl}/api/ws/live-chat?lang=${langParam}`;
        } else {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${protocol}//${window.location.host}/api/ws/live-chat?lang=${langParam}`;
        }

        // If resuming, tell the backend to load history from MongoDB.
        // We do NOT encode history in the URL (length limits, truncation risk).
        // The backend fetches it directly using the authenticated user_id cookie.
        if (isResume) {
          wsUrl += `&resume=true`;
        }

        if (token) {
          wsUrl += `&token=${encodeURIComponent(token)}`;
        }
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (
            !isAliveRef.current ||
            connectionIdRef.current !== myConnectionId
          ) {
            ws.close();
            return;
          }
          setPhaseWithRef("connected");
          setStatusText("Connected. Setting up session...");
          // DO NOT set isListening to true yet! We must wait for setupComplete
          // before sending any audio or clientContent.

          // Start processing audio
          processor.port.onmessage = (e) => {
            if (!isListeningRef.current || ws.readyState !== WebSocket.OPEN)
              return;
            // Ignore microphone input while AI is speaking or during initial resume setup
            if (isSpeakingRef.current || isInitialResumeSilentRef.current)
              return;
            const pcm16Buffer = e.data;

            const uint8Array = new Uint8Array(pcm16Buffer);
            let binary = "";
            for (let i = 0; i < uint8Array.byteLength; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64 = window.btoa(binary);

            ws.send(
              JSON.stringify({
                realtimeInput: {
                  mediaChunks: [
                    {
                      mimeType: "audio/pcm;rate=16000",
                      data: base64,
                    },
                  ],
                },
              }),
            );
          };

          source.connect(processor);
          // Connect to destination to make it fire, but use a GainNode with 0 gain to prevent echo
          const dummyGain = audioCtx.createGain();
          dummyGain.gain.value = 0;
          processor.connect(dummyGain);
          dummyGain.connect(audioCtx.destination);
        };

        ws.onmessage = async (event) => {
          if (!isAliveRef.current || connectionIdRef.current !== myConnectionId)
            return;
          try {
            let textData = event.data;
            if (textData instanceof Blob) {
              textData = await textData.text();
            }
            const msg = JSON.parse(textData);

            // Wait for setupComplete before activating mic
            if (msg.setupComplete) {
              setPhaseWithRef("connected");
              if (isResume) {
                // Lock the mic until the AI acknowledges memory restoration
                setIsListening(false);
                isListeningRef.current = false;
                setStatusText("Restoring memory...");
              } else {
                // NEW CHAT: Aria greets first. Keep the mic OFF, wave + smile,
                // and ask Gemini to deliver the opening greeting. The mic is
                // auto-enabled once the greeting turn completes (see turnComplete).
                setIsListening(false);
                isListeningRef.current = false;
                greetingDoneRef.current = false;
                setAvatarEmotion("happy");
                setIsWaving(true);
                setStatusText("Saying hello...");
                try {
                  wsRef.current.send(
                    JSON.stringify({
                      clientContent: {
                        turns: [
                          {
                            role: "user",
                            parts: [
                              {
                                text: "The session has just started and the user can now hear you. Greet them warmly out loud, briefly introduce yourself as Aria, and ask which Accounts Payable (AP) process they would like help with today. Keep it to one or two friendly sentences.",
                              },
                            ],
                          },
                        ],
                        turnComplete: true,
                      },
                    }),
                  );
                } catch (e) {
                  console.warn("Failed to send greeting trigger:", e);
                  // Fallback: if the greeting could not be sent, just open the mic.
                  setIsWaving(false);
                  greetingDoneRef.current = true;
                  setIsListening(true);
                  isListeningRef.current = true;
                  setStatusText("Listening...");
                }
              }
              return;
            }

            if (msg.error) {
              console.error("Backend error:", msg.error);
              setError(msg.error);
              setPhaseWithRef("error");
              return;
            }

            // Check for AI output audio chunks
            if (msg.serverContent && msg.serverContent.modelTurn) {
              currentUserTextRef.current = ""; // Reset user transcript buffer when model turn begins
              const parts = msg.serverContent.modelTurn.parts;
              for (let p of parts) {
                if (p.inlineData && p.inlineData.data) {
                  playAudioChunk(p.inlineData.data);
                }
              }
            }

            // Check for AI output transcription (real-time spoken words from the consultant)
            if (msg.serverContent && msg.serverContent.outputTranscription) {
              currentUserTextRef.current = ""; // Reset user transcript buffer when model responds
              const transText = msg.serverContent.outputTranscription.text;
              if (transText) {
                currentAiTextRef.current += transText;

                // Detect emotion from AI's accumulated text
                // Only update on a POSITIVE detection so the expression sticks
                // through the whole turn instead of flickering back to neutral
                // on chunks that happen to contain no emotion keywords.
                const detectedEmotion = detectEmotion(currentAiTextRef.current);
                if (detectedEmotion && detectedEmotion !== "neutral") {
                  setAvatarEmotion(detectedEmotion);
                }

                const updated = [...messagesRef.current];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: currentAiTextRef.current,
                  };
                } else {
                  updated.push({
                    role: "assistant",
                    content: currentAiTextRef.current,
                  });
                }
                messagesRef.current = updated;
                setMessages(updated);
              }
            }

            // When AI finishes a complete turn (turnComplete), immediately persist
            if (
              msg.serverContent &&
              msg.serverContent.turnComplete &&
              currentAiTextRef.current
            ) {
              const snapshot = [...messagesRef.current];
              persistNow(snapshot);
              currentAiTextRef.current = ""; // Reset after turn is fully done
              // (Emotion now fades to neutral via the isSpeaking effect, so it
              //  stays expressive for the entire spoken reply.)

              // FIX BUG 2: Auto-unlock mic reliably when AI finishes its first resume response!
              // We no longer rely on the brittle "restored" word check.
              if (isResume && !isListeningRef.current) {
                isInitialResumeSilentRef.current = false;
                setIsListening(true);
                isListeningRef.current = true;
                setStatusText("Resumed! Listening...");
              }

              // NEW CHAT: the opening greeting just finished -> auto-enable the mic.
              if (
                !isResume &&
                !greetingDoneRef.current &&
                !isListeningRef.current
              ) {
                greetingDoneRef.current = true;
                setIsListening(true);
                isListeningRef.current = true;
                setStatusText("Listening...");
              }
            }

            // Check for User output transcription (Gemini's authoritative phrase-level transcript)
            if (msg.serverContent && msg.serverContent.inputTranscription) {
              const transText = msg.serverContent.inputTranscription.text;
              if (transText) {
                currentAiTextRef.current = ""; // Reset AI transcript buffer since user is speaking
                setAvatarEmotion("neutral"); // Reset avatar emotion when user speaks
                const chunk = transText.trim();
                if (!currentUserTextRef.current) {
                  currentUserTextRef.current = chunk;
                } else if (chunk.startsWith(currentUserTextRef.current)) {
                  // Some Live API versions send the full transcript-so-far.
                  currentUserTextRef.current = chunk;
                } else if (!currentUserTextRef.current.endsWith(chunk)) {
                  // Other versions stream phrase-level deltas. Preserve every phrase.
                  currentUserTextRef.current += ` ${chunk}`;
                }

                const updated = [...messagesRef.current];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg && lastMsg.role === "user") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: currentUserTextRef.current,
                  };
                } else {
                  updated.push({
                    role: "user",
                    content: currentUserTextRef.current,
                  });
                }
                messagesRef.current = updated;
                setMessages(updated);
              }
            }

            // Check for interruption signal
            if (msg.serverContent && msg.serverContent.interrupted) {
              stopPlayback();
            }

            // Check if completion signal is in the accumulated AI text.
            // We set a flag but do NOT close the WS immediately — we let the audio
            // finish playing so the user hears "I'm generating your report now" before transition.
            const textUpper = currentAiTextRef.current.toUpperCase();
            const hasCompletionSignal =
              textUpper.includes("[DISCOVERY_COMPLETE]") ||
              textUpper.includes("DISCOVERY_COMPLETE") ||
              textUpper.includes("DISCOVERY COMPLETE") ||
              textUpper.includes("SENDING THIS OFF TO GENERATE") ||
              textUpper.includes("GENERATE YOUR FULL ANALYSIS REPORT");

            if (hasCompletionSignal && phaseRef.current !== "completing") {
              setPhaseWithRef("completing");
              setStatusText("Generating your analysis report...");
              // Immediately persist the messages to DB right now, including the final summary!
              const snapshot = [...messagesRef.current];
              persistNow(snapshot);
              // Close WS after a short delay to allow the final audio chunk to queue up
              setTimeout(() => {
                if (wsRef.current) wsRef.current.close();
              }, 2500);
            }
          } catch (e) {
            console.error("Message processing error", e);
          }
        };

        ws.onerror = (e) => {
          if (!isAliveRef.current || connectionIdRef.current !== myConnectionId)
            return;
          console.error("WebSocket error", e);
          setError("Connection error. Please try again.");
          setPhaseWithRef("error");
        };

        ws.onclose = (event) => {
          // Only show error if WS closed unexpectedly during active conversation.
          // Ignore if: we are completing (intentional close), still in initial connecting phase,
          // or the connection was superseded by a newer one.
          const isIntentionalClose = phaseRef.current === "completing";
          const isSetupPhase = phaseRef.current === "connecting";
          if (
            isAliveRef.current &&
            connectionIdRef.current === myConnectionId &&
            !isIntentionalClose &&
            !isSetupPhase
          ) {
            console.warn(
              `WS closed unexpectedly. Code: ${event.code}, Reason: ${event.reason}`,
            );
            setError(
              "Connection closed by server. Your conversation has been saved — you can resume it.",
            );
            setPhaseWithRef("error");
          }
        };
      } catch (err) {
        if (!isAliveRef.current || connectionIdRef.current !== myConnectionId)
          return;
        console.error(err);
        setError("Microphone access denied or connection failed.");
        setPhaseWithRef("error");
      }
    },
    [playAudioChunk, stopPlayback, isResume, persistNow],
  );

  useEffect(() => {
    isAliveRef.current = true;
    connectionIdRef.current += 1;
    const myConnectionId = connectionIdRef.current;

    // Automatically resume suspended AudioContext on any user gesture
    const resumeAudio = () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        audioContextRef.current
          .resume()
          .then(() =>
            console.log("AudioContext successfully resumed via user gesture"),
          )
          .catch((e) =>
            console.warn("Failed to resume AudioContext via user gesture:", e),
          );
      }
    };

    window.addEventListener("click", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
    window.addEventListener("touchstart", resumeAudio);

    let silenceLockTimer;
    if (isResume) {
      // PHASE 1: Show "Preparing" UI while Agent 1 (Director) generates the dynamic prompt.
      setPhase("preparing");
      setStatusText("Aria is reviewing your previous conversation...");
      isInitialResumeSilentRef.current = true;

      // Step 1: Call the REST endpoint to run Agent 1 and cache the dynamic system prompt
      prepareLiveChatResume(language)
        .then(() => {
          if (!isAliveRef.current || myConnectionId !== connectionIdRef.current)
            return;
          console.log("Agent 1 (Director) has prepared the resume prompt.");
          setStatusText("Loading your saved session...");

          // Step 2: Load the saved messages for the transcript UI
          return getLiveChatSession();
        })
        .then((res) => {
          if (
            !res ||
            !isAliveRef.current ||
            myConnectionId !== connectionIdRef.current
          )
            return;
          if (res.data?.messages) {
            setMessages(res.data.messages);
            messagesRef.current = res.data.messages;
          }

          // Step 3: Now open the WebSocket — the backend will pick up the cached prompt instantly
          setPhase("connecting");
          setStatusText("Connecting to Aria...");
          connectAndStart(myConnectionId);
        })
        .catch((err) => {
          console.error("Failed to prepare resume session", err);
          if (!isAliveRef.current || myConnectionId !== connectionIdRef.current)
            return;
          setError(`Failed to prepare resume: ${err.message}`);
          setPhaseWithRef("error");
        });
    } else {
      deleteLiveChatSession().catch((e) =>
        console.warn("Failed to clear session on fresh start", e),
      );
      connectAndStart(myConnectionId);
    }

    return () => {
      isAliveRef.current = false;
      stopPlayback();
      if (silenceLockTimer) clearTimeout(silenceLockTimer);
      window.removeEventListener("click", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      window.removeEventListener("touchstart", resumeAudio);
      if (wsRef.current) wsRef.current.close();
      if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      if (mediaStreamRef.current)
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Completing — build transcript and fire immediately───────────────
  useEffect(() => {
    if (phase !== "completing") return;

    // Wait until AI finishes speaking, then fire the analysis
    if (isSpeaking) return; // still playing audio — wait

    // Small grace delay so the final audio chunk can finish
    const timer = setTimeout(() => {
      const lines = ["=== AP Process Discovery Live Session ===", ""];
      messagesRef.current.forEach((msg) => {
        const role = msg.role === "user" ? "Client" : "Consultant";
        // Clean up markers and bolding
        let content = msg.content
          .replace(/\[DISCOVERY_COMPLETE\]/gi, "")
          .trim();
        content = content.replace(/\*\*DISCOVERY_COMPLETE\*\*/gi, "").trim();
        content = content.replace(/DISCOVERY_COMPLETE/gi, "").trim();
        if (content) {
          lines.push(`${role}: ${content}`);
          lines.push("");
        }
      });
      lines.push("=== End of Discovery Session ===");
      const fullTranscript = lines.join("\n");

      console.log(
        "[LiveChat] Sending transcript to analysis pipeline:",
        fullTranscript.substring(0, 500),
      );
      onComplete(fullTranscript);
    }, 1500);

    return () => clearTimeout(timer);
  }, [phase, isSpeaking, onComplete]);

  const handleEndCall = async () => {
    if (wsRef.current) wsRef.current.close();
    const snapshot = [...messagesRef.current];
    if (snapshot.length > 0) {
      try {
        await saveLiveChatSession(snapshot);
      } catch (e) {
        console.warn("Failed to save session before ending call", e);
      }
    }
    onCancel();
  };

  const toggleMic = () => {
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      audioContextRef.current
        .resume()
        .catch((e) =>
          console.warn("Failed to resume AudioContext on toggleMic click:", e),
        );
    }
    setIsListening((prev) => {
      const next = !prev;
      isListeningRef.current = next; // Update ref immediately for audio callback
      if (next && isSpeaking) {
        // Interruption!
        stopPlayback();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Send empty message to flush server queue
          wsRef.current.send(JSON.stringify({ clientContent: { turns: [] } }));
        }
      }
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────
  const baseClass =
    "w-32 h-32 rounded-full flex items-center justify-center relative";

  const formatMessage = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-white/90">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(5, 10, 30, 0.95)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-cyan-500/10" />

      <div className="w-full max-w-4xl bg-slate-900/60 border border-white/[0.05] shadow-2xl rounded-3xl overflow-hidden flex flex-col h-[85vh] max-h-[800px] relative z-10 backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
              <Bot size={20} className="text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                AP Discovery Live
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                {phase === "connected" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Secure WebSocket Connection
                  </>
                ) : (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    {statusText}
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleEndCall}
            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Content Split View */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Side: 3D Avatar (Aria) */}
          <div className="w-[44%] min-w-[300px] shrink-0 flex flex-col border-r border-white/[0.05] bg-gradient-to-b from-indigo-500/[0.05] via-purple-500/[0.02] to-transparent relative">
            <div className="flex-1 relative min-h-0">
              {phase === "connected" ? (
                <Suspense fallback={<AvatarLoading />}>
                  <Avatar3D
                    analyserRef={analyserRef}
                    speakingRef={isSpeakingRef}
                    emotion={avatarEmotion}
                    waving={isWaving}
                  />
                </Suspense>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                  {phase === "error" ? (
                    <>
                      <div className="w-28 h-28 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
                        <X size={36} className="text-red-400" />
                      </div>
                      <p className="mt-5 text-red-400 text-sm">{error}</p>
                    </>
                  ) : phase === "completing" ? (
                    <>
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 border-2 border-emerald-400/40 flex items-center justify-center shadow-xl shadow-emerald-500/20">
                        <Sparkles
                          size={34}
                          className="text-emerald-300 animate-pulse"
                        />
                      </div>
                      <p className="mt-5 text-emerald-300 font-semibold">
                        Discovery complete!
                      </p>
                    </>
                  ) : phase === "preparing" ? (
                    <>
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-600/30 to-purple-600/20 border-2 border-indigo-400/40 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                        <Bot
                          size={34}
                          className="text-indigo-300 animate-pulse"
                        />
                      </div>
                      <p className="mt-5 text-indigo-300 font-semibold">
                        Preparing your session
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        Aria is reviewing your conversation history...
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-slate-700/50 to-slate-800/50 border-2 border-white/5 flex items-center justify-center">
                        <Loader2
                          size={34}
                          className="text-violet-400 animate-spin"
                        />
                      </div>
                      <p className="mt-5 text-slate-300 font-medium">
                        {statusText}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Status label under the avatar */}
            <div className="shrink-0 px-6 pb-6 pt-2 flex flex-col items-center">
              {phase === "connected" ? (
                isSpeaking ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/15 border border-violet-400/30">
                    <SpeakingWave isActive={true} />
                    <span className="text-sm font-semibold text-violet-200">
                      Aria is speaking
                    </span>
                  </div>
                ) : isListening ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-400/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-semibold text-emerald-200">
                      Aria is listening
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-700/40 border border-white/10">
                    <MicOff size={14} className="text-slate-400" />
                    <span className="text-sm font-semibold text-slate-300">
                      Paused
                    </span>
                  </div>
                )
              ) : (
                <div className="h-9" />
              )}
            </div>
          </div>

          {/* Right Side: Transcript + Controls */}
          <div className="flex-1 flex flex-col bg-white/[0.01] min-w-0">
            <div className="relative flex-1 flex flex-col min-h-0">
              {/* Status header */}
              <div className="absolute top-0 inset-x-0 h-12 bg-slate-900/80 backdrop-blur-md border-b border-white/[0.05] z-10 flex items-center px-6 gap-3 shadow-sm">
                {isSpeaking ? (
                  <>
                    <div className="flex gap-1.5 items-center">
                      <SpeakingWave isActive={true} />
                    </div>
                    <span className="text-xs font-medium text-violet-300">
                      Aria is speaking...
                    </span>
                  </>
                ) : phase === "connected" ? (
                  <>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-emerald-300">
                      Aria is listening to you...
                    </span>
                  </>
                ) : phase === "completing" ? (
                  <>
                    <Loader2
                      size={14}
                      className="text-emerald-400 animate-spin"
                    />
                    <span className="text-xs font-medium text-emerald-300">
                      Finalizing transcript...
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-slate-400">
                    Live Transcript
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-16 scroll-smooth">
                {messages.filter((m) => m.role === "assistant").length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                    <Bot size={24} className="opacity-30" />
                    <p className="text-sm text-center">
                      Aria's responses will appear here
                      <br />
                      <span className="text-xs opacity-60">
                        Just start speaking — your voice is being captured
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {messages
                      .filter((m) => m.role === "assistant")
                      .map((msg, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 text-violet-400">
                            <Bot size={14} />
                          </div>
                          <div className="px-4 py-3 rounded-2xl max-w-[90%] bg-slate-800/80 border border-white/[0.06] text-slate-200 rounded-tl-sm">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {formatMessage(msg.content)}
                            </p>
                          </div>
                        </div>
                      ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="p-6 border-t border-white/[0.05] flex justify-center gap-4 bg-white/[0.02] shrink-0">
              <button
                onClick={toggleMic}
                disabled={phase !== "connected"}
                className={`p-4 rounded-2xl transition-all ${
                  phase !== "connected"
                    ? "opacity-50 cursor-not-allowed bg-slate-800 text-slate-500"
                    : isListening
                      ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                      : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                }`}
                title={isListening ? "Mute Microphone" : "Unmute Microphone"}
              >
                {isListening ? <Mic size={24} /> : <MicOff size={24} />}
              </button>

              <button
                onClick={handleEndCall}
                className="p-4 rounded-2xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all hover:scale-105"
                title="End Call"
              >
                <PhoneOff size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
