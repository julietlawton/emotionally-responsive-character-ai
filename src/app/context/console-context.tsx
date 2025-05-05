"use client";
import { createContext, useContext, useState, useCallback } from "react";

export type ConsoleLogEntry = {
    message: string;
    type?: "emotion" | "sentiment" | "transcription" | "info" | "error";
};

export type ConsoleLogContextType = {
    logs: ConsoleLogEntry[];
    addLog: (entry: ConsoleLogEntry) => void;
};

const ConsoleLogContext = createContext<ConsoleLogContextType | undefined>(undefined);

// Context for the app console
export function ConsoleLogProvider({ children }: { children: React.ReactNode }) {
    const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);

    // Callback for adding messages to the log
    const addLog = useCallback((entry: ConsoleLogEntry) => {
        // Show only up to the last 50 messages
        setLogs(prev => [...prev, entry].slice(-50));
    }, []);

    return (
        <ConsoleLogContext.Provider value={{ logs, addLog }}>
            {children}
        </ConsoleLogContext.Provider>
    );
}

export function useLog() {
    const context = useContext(ConsoleLogContext);
    if (!context) throw new Error("useLog must be used within a ConsoleLogProvider");
    return context;
}