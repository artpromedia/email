"use client";

/**
 * Draft Assistant Component
 * Inline suggestions, help me write, tone adjustment
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Wand2,
  Check,
  X,
  RefreshCw,
  ArrowRight,
  ChevronDown,
  Briefcase,
  Smile,
  Zap,
  FileText,
  AlertCircle,
} from "lucide-react";
import { cn } from "@email/ui";

// ============================================================
// TYPES
// ============================================================

type ToneAdjustment =
  | "formal"
  | "casual"
  | "shorter"
  | "longer"
  | "polite"
  | "direct"
  | "friendly"
  | "assertive";

interface InlineSuggestion {
  suggestion: string;
  fullCompletion: string;
  confidence: number;
}

interface HelpMeWriteResponse {
  subject?: string;
  body: string;
  preview: string;
  wordCount: number;
  tone: string;
}

interface ToneAdjustResponse {
  originalText: string;
  adjustedText: string;
  changes: { original: string; replacement: string; reason: string }[];
}

interface GrammarCheckResponse {
  originalText: string;
  correctedText: string;
  issues: {
    type: string;
    original: string;
    suggestion: string;
    explanation: string;
  }[];
  score: number;
}

// ============================================================
// INLINE SUGGESTION (GHOST TEXT)
// ============================================================

interface InlineSuggestionProps {
  currentText: string;
  cursorPosition: number;
  subject?: string;
  recipients?: string[];
  userId: string;
  orgId: string;
  userName: string;
  userEmail: string;
  onAccept: (text: string) => void;
  enabled?: boolean;
}

export function useInlineSuggestion({
  currentText,
  cursorPosition,
  subject,
  recipients,
  userId,
  orgId,
  userName,
  userEmail,
  enabled = true,
}: Omit<InlineSuggestionProps, "onAccept">) {
  const [suggestion, setSuggestion] = useState<InlineSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestion = useCallback(async () => {
    if (!enabled || currentText.length < 10) {
      setSuggestion(null);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/draft/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_text: currentText,
          cursor_position: cursorPosition,
          subject,
          recipients,
          user_id: userId,
          org_id: orgId,
          user_name: userName,
          user_email: userEmail,
          max_length: 100,
        }),
      });

      if (response.ok) {
        const data: InlineSuggestion = await response.json();
        if (data.suggestion) {
          setSuggestion(data);
        } else {
          setSuggestion(null);
        }
      }
    } catch {
      setSuggestion(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentText, cursorPosition, subject, recipients, userId, orgId, enabled]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(fetchSuggestion, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchSuggestion]);

  return { suggestion, isLoading };
}

// Ghost text overlay component
export function GhostText({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && suggestion) {
        e.preventDefault();
        onAccept();
      } else if (e.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [suggestion, onAccept, onDismiss]);

  if (!suggestion) return null;

  return (
    <span className="pointer-events-none text-neutral-400 dark:text-neutral-500">
      {suggestion}
      <span className="ml-2 rounded bg-neutral-100 px-1 text-[10px] text-neutral-500 dark:bg-neutral-800">
        Tab to accept
      </span>
    </span>
  );
}

// ============================================================
// HELP ME WRITE BUTTON & MODAL
// ============================================================

interface HelpMeWriteProps {
  onInsert: (text: string) => void;
  currentText?: string;
  subject?: string;
  recipients?: { name: string; email: string }[];
  inReplyTo?: {
    subject: string;
    body: string;
    fromName: string;
    fromAddress: string;
  };
  userId: string;
  orgId: string;
  userName: string;
  userEmail: string;
  userSignature?: string;
  className?: string;
}

export function HelpMeWriteButton({
  onInsert,
  currentText,
  subject,
  recipients,
  inReplyTo,
  userId,
  orgId,
  userName,
  userEmail,
  userSignature,
  className,
}: HelpMeWriteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<HelpMeWriteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<ToneAdjustment>("formal");

  const toneOptions: { value: ToneAdjustment; label: string; icon: React.ReactNode }[] = [
    { value: "formal", label: "Formal", icon: <Briefcase className="h-4 w-4" /> },
    { value: "friendly", label: "Friendly", icon: <Smile className="h-4 w-4" /> },
    { value: "shorter", label: "Concise", icon: <Zap className="h-4 w-4" /> },
    { value: "casual", label: "Casual", icon: <FileText className="h-4 w-4" /> },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/draft/help-me-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          current_text: currentText,
          subject,
          recipients: recipients?.map((r) => ({ name: r.name, email: r.email, type: "to" })),
          in_reply_to: inReplyTo
            ? {
                subject: inReplyTo.subject,
                body: inReplyTo.body,
                from_name: inReplyTo.fromName,
                from_address: inReplyTo.fromAddress,
              }
            : undefined,
          user_id: userId,
          org_id: orgId,
          user_name: userName,
          user_email: userEmail,
          user_signature: userSignature,
          tone_preference: tone,
          include_greeting: true,
          include_closing: true,
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const data: HelpMeWriteResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = () => {
    if (result) {
      onInsert(result.body);
      setIsOpen(false);
      setResult(null);
      setPrompt("");
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
          "bg-gradient-to-r from-violet-500 to-blue-500 text-white",
          "hover:from-violet-600 hover:to-blue-600",
          "transition-all hover:shadow-md",
          className
        )}
      >
        <Wand2 className="h-4 w-4" />
        Help me write
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-neutral-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-500" />
                <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Help me write
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {!result ? (
                <>
                  {/* Prompt Input */}
                  <div className="mb-4">
                    <label
                      htmlFor="help-me-write-prompt"
                      className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                    >
                      What would you like to write?
                    </label>
                    <textarea
                      id="help-me-write-prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., Write a follow-up email asking about the proposal status..."
                      className="w-full rounded-lg border p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-neutral-600 dark:bg-neutral-900"
                      rows={3}
                    />
                  </div>

                  {/* Tone Selection */}
                  <div className="mb-4">
                    <span className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Tone
                    </span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Tone selection">
                      {toneOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setTone(option.value)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                            tone === option.value
                              ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                              : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-600 dark:text-neutral-400"
                          )}
                        >
                          {option.icon}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isLoading}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white",
                      "bg-gradient-to-r from-violet-500 to-blue-500",
                      "hover:from-violet-600 hover:to-blue-600",
                      "disabled:opacity-50"
                    )}
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Result Preview */}
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Generated Draft
                      </span>
                      <span className="text-xs text-neutral-500">{result.wordCount} words</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-lg border bg-neutral-50 p-3 text-sm dark:border-neutral-600 dark:bg-neutral-900">
                      <pre className="whitespace-pre-wrap font-sans text-neutral-700 dark:text-neutral-300">
                        {result.body}
                      </pre>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setResult(null)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Regenerate
                    </button>
                    <button
                      onClick={handleInsert}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-700"
                    >
                      <Check className="h-4 w-4" />
                      Insert
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// TONE ADJUSTMENT MENU
// ============================================================

interface ToneAdjustmentMenuProps {
  selectedText: string;
  onApply: (newText: string) => void;
  userId: string;
  orgId: string;
  className?: string;
}

export function ToneAdjustmentMenu({
  selectedText,
  onApply,
  userId,
  orgId,
  className,
}: ToneAdjustmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<ToneAdjustResponse | null>(null);
  const [activeTone, setActiveTone] = useState<ToneAdjustment | null>(null);

  const toneOptions: { value: ToneAdjustment; label: string; description: string }[] = [
    { value: "formal", label: "More Formal", description: "Professional business language" },
    { value: "casual", label: "More Casual", description: "Relaxed, conversational" },
    { value: "shorter", label: "Make Shorter", description: "Concise and to the point" },
    { value: "polite", label: "More Polite", description: "Add courtesy phrases" },
    { value: "direct", label: "More Direct", description: "Remove hedging language" },
    { value: "friendly", label: "More Friendly", description: "Warm and approachable" },
  ];

  const handleToneSelect = async (tone: ToneAdjustment) => {
    setActiveTone(tone);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/draft/adjust-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selectedText,
          target_tone: tone,
          preserve_length: tone !== "shorter" && tone !== "longer",
          user_id: userId,
          org_id: orgId,
        }),
      });

      if (response.ok) {
        const data: ToneAdjustResponse = await response.json();
        setPreview(data);
      }
    } catch {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (preview) {
      onApply(preview.adjustedText);
      setIsOpen(false);
      setPreview(null);
      setActiveTone(null);
    }
  };

  if (!selectedText) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Adjust Tone
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {!preview ? (
            <div className="p-2">
              {toneOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleToneSelect(option.value)}
                  disabled={isLoading}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700",
                    activeTone === option.value && isLoading && "opacity-50"
                  )}
                >
                  <div>
                    <div className="font-medium text-neutral-700 dark:text-neutral-300">
                      {option.label}
                    </div>
                    <div className="text-xs text-neutral-500">{option.description}</div>
                  </div>
                  {activeTone === option.value && isLoading && (
                    <RefreshCw className="h-4 w-4 animate-spin text-violet-500" />
                  )}
                  <ArrowRight className="h-4 w-4 text-neutral-400" />
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <div className="mb-2 text-xs font-medium text-neutral-500">Preview</div>
              <div className="mb-3 rounded border bg-neutral-50 p-2 text-sm dark:border-neutral-600 dark:bg-neutral-900">
                {preview.adjustedText}
              </div>

              {preview.changes.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-neutral-500">Changes Made</div>
                  {preview.changes.slice(0, 3).map((change, i) => (
                    <div key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="text-red-500 line-through">{change.original}</span>
                      {" → "}
                      <span className="text-green-600">{change.replacement}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPreview(null);
                    setActiveTone(null);
                  }}
                  className="flex-1 rounded border py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 rounded bg-violet-600 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// GRAMMAR CHECK BUTTON
// ============================================================

interface GrammarCheckProps {
  text: string;
  onFix: (fixedText: string) => void;
  userId: string;
  orgId: string;
  className?: string;
}

export function GrammarCheckButton({ text, onFix, userId, orgId, className }: GrammarCheckProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GrammarCheckResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const checkGrammar = async () => {
    if (!text.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/draft/grammar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          user_id: userId,
          org_id: orgId,
        }),
      });

      if (response.ok) {
        const data: GrammarCheckResponse = await response.json();
        setResult(data);
        setIsOpen(true);
      }
    } catch {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  };

  const handleFix = () => {
    if (result) {
      onFix(result.correctedText);
      setIsOpen(false);
      setResult(null);
    }
  };

  return (
    <>
      <button
        onClick={checkGrammar}
        disabled={isLoading || !text.trim()}
        className={cn(
          "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
          "text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700",
          "disabled:opacity-50",
          className
        )}
      >
        {isLoading ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        Check Grammar
      </button>

      {/* Results Popup */}
      {isOpen && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-neutral-800">
            <div className="flex items-center justify-between border-b px-4 py-3 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Grammar Check</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    result.score >= 90
                      ? "bg-green-100 text-green-700"
                      : result.score >= 70
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                  )}
                >
                  Score: {result.score}
                </span>
                <button onClick={() => setIsOpen(false)}>
                  <X className="h-5 w-5 text-neutral-500" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto p-4">
              {result.issues.length === 0 ? (
                <div className="text-center text-green-600">
                  <Check className="mx-auto mb-2 h-8 w-8" />
                  <p className="font-medium">No issues found!</p>
                  <p className="text-sm text-neutral-500">Your text looks great.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="rounded-lg border p-3 dark:border-neutral-700">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            issue.type === "grammar"
                              ? "bg-red-100 text-red-700"
                              : issue.type === "spelling"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {issue.type}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-red-500 line-through">{issue.original}</span>
                        {" → "}
                        <span className="font-medium text-green-600">{issue.suggestion}</span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{issue.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result.issues.length > 0 && (
              <div className="border-t p-4 dark:border-neutral-700">
                <button
                  onClick={handleFix}
                  className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Fix All Issues
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
