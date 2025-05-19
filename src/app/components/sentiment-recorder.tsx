"use client";
import React, { RefObject, useEffect, useRef, useState } from "react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { useMicrophoneManager } from "@/app/components/microphone-manager";
import { DirectedSentiment } from "@/lib/types";
import { useLog } from "@/app/context/console-context";

// Directed sentiment detection component
export default function SentimentRecorder({
    mic,
    setIsConnecting,
    setIsReady,
    isUserSpeaking,
    inferenceSession,
    tokenizerRef,
    onSentimentDetected,
    isInferenceBusy
}: {
    mic: ReturnType<typeof useMicrophoneManager>,
    setIsConnecting: (status: boolean) => void,
    setIsReady: (status: boolean) => void,
    isUserSpeaking: boolean,
    inferenceSession: any,
    tokenizerRef: any,
    onSentimentDetected: (sentiment: DirectedSentiment, confidence: number) => void,
    isInferenceBusy: RefObject<boolean>
}) {
    // Media recorder context
    const recorderRef = useRef<MediaRecorder | null>(null);
    const liveRef = useRef<any>(null);
    const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // User speech transcript
    const [userTranscript, setUserTranscript] = useState("");
    const transcriptQueueRef = useRef<string[]>([]);

    // App console logger
    const { addLog } = useLog();

    // Track when user is speaking
    // When the user stops speaking, clear the transcript
    const isUserSpeakingRef = useRef(isUserSpeaking);
    useEffect(() => {
        isUserSpeakingRef.current = isUserSpeaking;
        if (isUserSpeaking) {
            setUserTranscript("");
        }
    }, [isUserSpeaking]);

    useEffect(() => {
        if (!userTranscript.trim()) return;
        // Add transcript event to the console log
        addLog({message: userTranscript, type: "transcription"});
        // Add new transcript to queue and run inference
        transcriptQueueRef.current.push(userTranscript);
        processQueue();
    }, [userTranscript]);

    useEffect(() => {
        // Start session and connect to Deepgram transcription service
        async function startSession() {
            setIsConnecting(true);

            try {
                // Get temporary auth
                const res = await fetch("/api/auth-deepgram");
                const data = await res.json();
                const deepgram = createClient(data.key);

                // Configure Deepgram live transcription settings
                const live = deepgram.listen.live({
                    model: "nova-3",
                    filler_words: true,
                    punctuate: true,
                });

                // Log transcription error
                live.on(LiveTranscriptionEvents.Error, (error: any) => {
                    console.error("Deepgram error:", error);
                });

                // Get shared mic stream from microphone manager
                const stream = mic.stream;
                if (!stream) {
                    console.error("No mic stream available");
                    return;
                }

                // Create media recorder on shared mic stream
                const recorder = new MediaRecorder(stream);

                // Send events from the recorder to Deepgram
                recorder.ondataavailable = (e) => {
                    if (live.getReadyState() === WebSocket.OPEN) {
                        live.send(e.data);
                    } else {
                        console.warn("Deepgram WebSocket not open — dropping audio chunk");
                    }
                };

                // Once the connection is open, start sending audio and keep alive by sending ping every 10s
                live.on(LiveTranscriptionEvents.Open, () => {
                    setIsReady(true);
                    recorder.start(200);
                    keepAliveIntervalRef.current = setInterval(() => live.keepAlive(), 10000);
                });

                // Handle incoming transcription
                live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
                    const transcript = data.channel.alternatives[0].transcript;
                    if (transcript && isUserSpeakingRef.current) {
                        setUserTranscript((t) => t + transcript + " ");
                    }
                });
                liveRef.current = live;
                recorderRef.current = recorder;
            } catch (err) {
                console.error("Failed to start Deepgram session:", err);
            } finally {
                setIsConnecting(false);
            }
        }

        // Handle stop session
        async function stopSession() {
            // Tear down recorder and close Deepgram connection
            if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
            if (recorderRef.current) recorderRef.current.stop();
            if (liveRef.current) liveRef.current.requestClose();

            recorderRef.current = null;
            liveRef.current = null;
            setIsReady(false);
        }

        // Start session when microphone is turned on and stop when it is turned off
        if (mic.isMicActive) {
            startSession();
        } else {
            stopSession();
        }

        // Cleanup if component unmounts
        return () => {
            stopSession();
        };
    }, [mic.isMicActive, mic.stream]);

    // Run directed sentiment classifier inference
    async function processQueue() {
        // If inference is busy or the queue is empty, exit
        if (isInferenceBusy.current || transcriptQueueRef.current.length === 0){
            return;
        }
        isInferenceBusy.current = true;

        // Get the transcript to run inference on
        const nextTranscript = transcriptQueueRef.current.shift();
        try {
            // Run the sentiment classifier on the transcript
            const start = performance.now();
            // Tokenize the input
            const tokenizer = tokenizerRef.current;
            const tokens = await tokenizer(nextTranscript, { padding: true, truncation: true });
            // Run the model
            const output = await inferenceSession.run({
                input_ids: tokens.input_ids,
                attention_mask: tokens.attention_mask,
            });
            const end = performance.now();

            // Log inference latency
            addLog({
                message: `Inference completed in ${(end - start).toFixed(2)} ms`,
                type: "sentiment"
            });
            
            // Get prediction logits
            const labels = ["Neutral", "Positive", "Negative"];
            const logits = output.logits.data as Float16Array;
            const maxLogit = Math.max(...logits);

            // Compute softmax to turn logits into probabilities
            const exps = logits.map(x => Math.exp(x - maxLogit));
            const sumExps = exps.reduce((a, b) => a + b, 0);
            const probs = exps.map(e => e / sumExps);
            const maxIndex = probs.indexOf(Math.max(...probs));

            // Get the predicted label and confidence score
            const pickedSentiment = labels[maxIndex] as DirectedSentiment;
            const confidence = probs[maxIndex];

            // Log predicted sentiment and confidence score
            addLog({
                message: `Predicted sentiment: ${pickedSentiment} with ${(confidence * 100).toFixed(1)}% confidence`,
                type: "sentiment"
            });
    
            // Set new sentiment
            onSentimentDetected(pickedSentiment, confidence)
        } catch (e) {
            console.error("Sentiment inference failed:", e);
        } finally {
            isInferenceBusy.current = false;
            // After finishing, immediately process next job if there is one
            if (transcriptQueueRef.current.length > 0) {
                processQueue();
            }
        }
    }
    return <div></div>;
}