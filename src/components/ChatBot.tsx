import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, Zap, Brain, AlertCircle } from "lucide-react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/utils/cn";
import { GeminiModel, generateContent } from "@/src/services/gemini";
import { ThinkingLevel } from "@google/genai";

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: number;
  model?: GeminiModel;
  thinking?: boolean;
}

interface ChatBotProps {
  onError: (message: string) => void;
}

export function ChatBot({ onError }: ChatBotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(GeminiModel.PRO);
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Keyboard shortcut: Ctrl+Enter to send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && inputRef.current === document.activeElement) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const options: any = {
        model: selectedModel,
      };

      if (isThinkingMode) {
        options.thinkingLevel = ThinkingLevel.HIGH;
        // Ensure we use Pro for thinking mode as per requirements
        options.model = GeminiModel.PRO;
      }

      const response = await generateContent(input, options);

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: response,
        timestamp: Date.now(),
        model: options.model,
        thinking: isThinkingMode,
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (error: any) {
      console.error("Chat Error:", error);
      onError(error?.message || "Failed to get a response from the AI.");
      
      // Add a system error message to the chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: "⚠️ **Error:** I encountered an issue while processing your request. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-900">Gemini Nexus</h2>
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Online & Ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedModel(GeminiModel.FLASH_LITE);
              setIsThinkingMode(false);
            }}
            className={cn(
              "p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-medium",
              selectedModel === GeminiModel.FLASH_LITE && !isThinkingMode
                ? "bg-amber-100 text-amber-700 shadow-sm"
                : "hover:bg-zinc-100 text-zinc-600"
            )}
            title="Fast AI responses (Flash Lite)"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Fast</span>
          </button>
          
          <button
            onClick={() => {
              setSelectedModel(GeminiModel.PRO);
              setIsThinkingMode(false);
            }}
            className={cn(
              "p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-medium",
              selectedModel === GeminiModel.PRO && !isThinkingMode
                ? "bg-indigo-100 text-indigo-700 shadow-sm"
                : "hover:bg-zinc-100 text-zinc-600"
            )}
            title="Standard AI (Pro)"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Pro</span>
          </button>

          <button
            onClick={() => {
              setIsThinkingMode(!isThinkingMode);
              setSelectedModel(GeminiModel.PRO);
            }}
            className={cn(
              "p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-medium",
              isThinkingMode
                ? "bg-purple-100 text-purple-700 shadow-sm"
                : "hover:bg-zinc-100 text-zinc-600"
            )}
            title="Thinking Mode (High Reasoning)"
          >
            <Brain className="w-4 h-4" />
            <span className="hidden sm:inline">Think</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-zinc-400" />
            </div>
            <div>
              <p className="text-zinc-900 font-medium">Welcome to Gemini Nexus</p>
              <p className="text-sm text-zinc-500 max-w-xs">
                Ask me anything. I can analyze content, write code, or just chat.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-4 max-w-[85%]",
                message.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                message.role === "user" ? "bg-zinc-900 text-white" : "bg-indigo-600 text-white"
              )}>
                {message.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              
              <div className="space-y-1">
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed shadow-sm border",
                  message.role === "user" 
                    ? "bg-zinc-900 text-white border-zinc-800 rounded-tr-none" 
                    : "bg-white text-zinc-800 border-zinc-100 rounded-tl-none"
                )}>
                  <div className="markdown-body prose prose-sm max-w-none">
                    <Markdown>{message.content}</Markdown>
                  </div>
                </div>
                
                {message.role === "model" && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                      {message.thinking ? "Thinking Mode" : message.model?.split('-')[2] || "AI"}
                    </span>
                    <span className="text-[10px] text-zinc-300">•</span>
                    <span className="text-[10px] text-zinc-400">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-4 mr-auto max-w-[85%]"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-white border border-zinc-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="text-sm text-zinc-500 font-medium">
                {isThinkingMode ? "Analyzing complex query..." : "Gemini is typing..."}
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-zinc-50/50 border-t border-zinc-100">
        <div className="relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isThinkingMode ? "Ask a complex question..." : "Type your message..."}
            className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none min-h-[52px] max-h-32 shadow-sm"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              "absolute right-2 bottom-2 p-2 rounded-lg transition-all",
              input.trim() && !isLoading
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-center text-zinc-400">
          Powered by Google Gemini. Responses may vary in accuracy.
        </p>
      </div>
    </div>
  );
}
