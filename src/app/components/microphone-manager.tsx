import { useState } from "react";
import { useLog } from "@/app/context/console-context";

// Global microphone manager
export function useMicrophoneManager() {
    // Microphone state
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isMicActive, setIsMicActive] = useState(false);

    // App console logger
    const { addLog } = useLog();

    // Start microphone
    const startMic = async () => {
        setIsConnecting(true);
        try {
            addLog({message: "Starting session...", type: "info"})
            // Get shared mic stream and mark microphone as active
            // This stream is shared by all audio components
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStream(micStream);
            setIsMicActive(true);
        } catch (e) {
            console.error("Failed to start microphone:", e);
        } finally {
            setIsConnecting(false);
        }
    };

    // Stop microphone
    const stopMic = () => {
        addLog({message: "Stopping session...", type: "info"})
        // Stop all mic tracks
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        // Mark microphone as off
        setStream(null);
        setIsMicActive(false);
    };

    return { stream, isConnecting, isMicActive, startMic, stopMic };
}