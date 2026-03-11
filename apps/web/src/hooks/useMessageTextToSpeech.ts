import { ThreadId } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { toastManager } from "../components/ui/toast";
import {
  applyCortanaLikeSpeechStyle,
  isTextToSpeechSupported,
  normalizeTextForSpeech,
} from "../textToSpeech";

function describeSpeechError(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    typeof error.error === "string" &&
    error.error.trim().length > 0
  ) {
    return error.error;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unable to read this message aloud.";
}

export function useMessageTextToSpeech() {
  const activeThreadId = useParams({
    strict: false,
    select: (params) =>
      typeof params.threadId === "string" ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  const [supported] = useState(() => isTextToSpeechSupported());
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const reportSpeechError = useCallback(
    (error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Text-to-speech failed",
        description: describeSpeechError(error),
        ...(activeThreadId ? { data: { threadId: activeThreadId } } : {}),
      });
    },
    [activeThreadId],
  );

  const stop = useCallback(() => {
    const utterance = activeUtteranceRef.current;
    activeUtteranceRef.current = null;
    setActiveMessageId(null);

    if (!supported || utterance === null) {
      return;
    }

    globalThis.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (messageId: string, rawText: string) => {
      if (!supported) {
        return;
      }

      const nextText = normalizeTextForSpeech(rawText);
      if (nextText.length === 0) {
        return;
      }

      stop();

      const utterance = new globalThis.SpeechSynthesisUtterance(nextText);
      applyCortanaLikeSpeechStyle(
        utterance,
        globalThis.speechSynthesis.getVoices?.() ?? [],
      );
      utterance.addEventListener("end", () => {
        if (activeUtteranceRef.current !== utterance) {
          return;
        }
        activeUtteranceRef.current = null;
        setActiveMessageId(null);
      });
      utterance.addEventListener("error", (event) => {
        if (activeUtteranceRef.current !== utterance) {
          return;
        }
        activeUtteranceRef.current = null;
        setActiveMessageId(null);
        reportSpeechError(event);
      });

      try {
        activeUtteranceRef.current = utterance;
        globalThis.speechSynthesis.speak(utterance);
        setActiveMessageId(messageId);
      } catch (error) {
        activeUtteranceRef.current = null;
        setActiveMessageId(null);
        reportSpeechError(error);
      }
    },
    [reportSpeechError, stop, supported],
  );

  useEffect(() => stop, [stop]);

  return {
    supported,
    activeMessageId,
    speak,
    stop,
  } as const;
}
