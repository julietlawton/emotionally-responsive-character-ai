"use client"
import { useEffect, useRef } from "react";
import { useMicrophoneManager } from "@/app/components/microphone-manager";

// Component for OpenAI realtime API
export default function RealtimeChat({
    mic,
    setIsConnecting,
    setIsReady,
    onSpeechStart,
    onSpeechStop,
    voice,
    profile
}: {
    mic: ReturnType<typeof useMicrophoneManager>,
    setIsConnecting: (status: boolean) => void,
    setIsReady: (status: boolean) => void,
    onSpeechStart?: () => void,
    onSpeechStop?: () => void,
    voice: string,
    profile: string
}) {
    // WebRTC context
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const dataChannel = useRef<RTCDataChannel | null>(null);

    // Audio player
    const audioElement = useRef<HTMLAudioElement | null>(null);

    // Handle events
    const handleMessage = (e: MessageEvent) => {
        const event = JSON.parse(e.data);
        // Flag when user starts talking
        if (event.type === "input_audio_buffer.speech_started") {
            onSpeechStart?.();
        }

        // Flag when user has stopped talking
        // response.content_part.added is unsed instead of input_audio_buffer.speech_stopped because 
        // that event can fire during a pause before the user is completely done speaking
        if (event.type === "response.content_part.added") {
            onSpeechStop?.();
        }

    };

    // Attach audio element to DOM on mount to play incoming voice
    useEffect(() => {
        if (!audioElement.current) {
            audioElement.current = document.createElement("audio");
            audioElement.current.autoplay = true;
        }
    }, []);

    // Tear down audio element on unmount
    useEffect(() => {
        return () => {
            audioElement.current?.pause();
            audioElement.current?.remove();
            audioElement.current = null;
        };
    }, []);

    // Start and stop the session based on mic state
    useEffect(() => {
        if (!mic.isMicActive || !mic.stream) {
            stopSession();
            return;
        }
        startSession();
    }, [mic.isMicActive]);

    // Handle starting the realtime chat component
    const startSession = async () => {
        setIsConnecting(true);
        try {
            // Get ephemeral api key
            const res = await fetch("/api/auth-openai", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    voice: voice,
                    instructions: profile,
                }),
            });
            const data = await res.json();
            const token = data.client_secret.value;

            // Create WebRTC peer connection and attach remote audio to audio player
            const pc = new RTCPeerConnection();
            pc.ontrack = (e) => {
                audioElement.current!.srcObject = e.streams[0];
            };

            // Get shared mic stream from microphone manager
            const stream = mic.stream;
            if (!stream) return;

            // Clone the shared audio stream and add it to the peer connection
            const clonedStream = stream.clone();
            pc.addTrack(clonedStream.getTracks()[0]);

            // Create data channel for events and add handleMessage event listener
            const dc = pc.createDataChannel("oai-events");
            dataChannel.current = dc;
            dc.addEventListener("message", handleMessage);

            // Send SDP offer to server
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const sdpRes = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
                method: "POST",
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/sdp",
                },
            });

            // Get answer and establish connection
            const sdpText = await sdpRes.text();
            await pc.setRemoteDescription({
                type: "answer" as RTCSdpType,
                sdp: sdpText,
            });
            peerConnection.current = pc;
            setIsReady(true);
        } catch (err) {
            console.error("Failed to start session", err);
        } finally {
            setIsConnecting(false);
        }
    };

    // Handle stopping session
    const stopSession = () => {
        // Close data channel and peer connection
        setIsReady(false);
        dataChannel.current?.removeEventListener("message", handleMessage);
        dataChannel.current?.close();
        peerConnection.current?.getSenders().forEach((s) => s.track?.stop());
        peerConnection.current?.close();

        peerConnection.current = null;
        dataChannel.current = null;
    };

    return (
        <div></div>
    );
}
