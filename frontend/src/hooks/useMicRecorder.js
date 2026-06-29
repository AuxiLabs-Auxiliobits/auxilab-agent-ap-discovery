import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio } from '../services/api';

/**
 * Custom hook for recording audio from the microphone and transcribing it.
 * Reusable across InputPanel and ChatView.
 *
 * @param {function} onTranscriptionComplete - Callback with the transcribed text string.
 */
export default function useMicRecorder(onTranscriptionComplete) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setDuration(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use audio/webm (best cross-browser support)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(250); // Collect data in 250ms chunks
      setIsRecording(true);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Microphone access denied. Please allow mic permission in your browser settings.");
      } else if (err.name === 'NotFoundError') {
        setError("No microphone found. Please connect a mic and try again.");
      } else {
        setError("Could not access microphone: " + err.message);
      }
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false);

        // Stop all mic tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Assemble the blob
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setError("Recording is too short. Please speak for at least a second.");
          resolve();
          return;
        }

        // Transcribe
        setIsTranscribing(true);
        setError(null);

        try {
          const result = await transcribeAudio(blob);
          if (result.status === 'success' && result.data?.text) {
            onTranscriptionComplete?.(result.data.text);
          } else {
            setError("Transcription returned empty text. Please try again.");
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError(err.message || "Failed to transcribe audio.");
        } finally {
          setIsTranscribing(false);
        }

        resolve();
      };

      mediaRecorderRef.current.stop();
    });
  }, [onTranscriptionComplete]);

  const cancelRecording = useCallback(() => {
    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop the recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {}; // Prevent transcription
      mediaRecorderRef.current.stop();
    }

    // Stop all mic tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
    setError(null);
  }, []);

  // Format duration as MM:SS
  const formattedDuration = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;

  return {
    isRecording,
    isTranscribing,
    duration,
    formattedDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    setError,
  };
}
