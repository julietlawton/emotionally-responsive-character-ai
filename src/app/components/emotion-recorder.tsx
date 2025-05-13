"use client";
import { RefObject, useEffect, useRef } from "react";
import { Emotion } from "@/lib/types";
import { useMicrophoneManager } from "@/app/components/microphone-manager";
import * as ort from "onnxruntime-web";
import { ConsoleLogEntry, useLog } from "@/app/context/console-context";

// Emotion detection component
export default function EmotionRecorder({
    mic,
    isUserSpeaking,
    inferenceSession,
    onEmotionDetected,
    isInferenceBusy
}: {
    mic: ReturnType<typeof useMicrophoneManager>,
    isUserSpeaking: boolean,
    inferenceSession: any,
    onEmotionDetected: (emotion: Emotion, confidence: number) => void,
    isInferenceBusy: RefObject<boolean>
}) {
    // Audio context
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    // App console logger
    const { addLog } = useLog();

    // Track when user is speaking
    const isUserSpeakingRef = useRef(isUserSpeaking);
    useEffect(() => {
        isUserSpeakingRef.current = isUserSpeaking;
    }, [isUserSpeaking]);

    useEffect(() => {
        if (!mic.stream || !mic.isMicActive) return;

        async function setupAudio() {
            // Set up audio context for web audio api and set SR to 16kHz
            const context = new AudioContext({ sampleRate: 16000 });
            await context.audioWorklet.addModule("/emotion-audio-processor.js");

            // Create audio worklet node
            const workletNode = new AudioWorkletNode(context, "emotion-audio-processor");

            // Get shared microphone stream from mic manager
            const stream = mic.stream;
            if (!stream) {
                console.error("No mic stream available");
                return;
            }

            // Attach audio worklet node to the mic stream
            const source = new MediaStreamAudioSourceNode(context, { mediaStream: stream });
            source.connect(workletNode);
            workletNode.connect(context.destination);

            // Handle audio messages from the processor
            workletNode.port.onmessage = async (event) => {
                const slice = new Float16Array(event.data);

                // If a message is sent but the user is not speaking, ignore
                if (!isUserSpeakingRef.current) {
                    return;
                }

                // Run SER inference on this audio slice
                const run = async () => {
                    isInferenceBusy.current = true;
                    await runInference(slice, inferenceSession, onEmotionDetected, addLog);
                    isInferenceBusy.current = false;
                };
                
                // If onnx session is currently busy, wait 100 ms and then run
                if (isInferenceBusy.current) {
                    setTimeout(run, 100);
                } else {
                    await run();
                }
            };
            
            // Set refs for audio context and audio worklet node
            audioContextRef.current = context;
            workletNodeRef.current = workletNode;
        }
        setupAudio();

        // Clean up this component
        return () => {
            // Tear down audio context and worklet node
            workletNodeRef.current?.disconnect();
            audioContextRef.current?.close();
            workletNodeRef.current = null;
            audioContextRef.current = null;
        };
    }, [mic.isMicActive, mic.stream]);

    return <div></div>;
}

// SER inference function
async function runInference(
    samples: Float16Array,
    inferenceSession: any,
    onEmotionDetected: (emotion: Emotion, confidence: number) => void,
    addLog: (log: ConsoleLogEntry) => void
) {
    // If the audio is less than 2s, exit
    if (samples.length !== 32000) {
        return;
    }

    // Perform z score normalization on the audio
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    const normalized = samples.map(x => (x - mean) / (std + 1e-5));

    // Create input tensor
    const tensor = new ort.Tensor("float16", normalized, [1, normalized.length]);

    try {
        // Run SER model on the input tensor
        const start = performance.now();
        const results = await inferenceSession.run({ input_values: tensor });
        const end = performance.now();

        // Log inference latency
        addLog({
            message: `Inference completed in ${(end - start).toFixed(2)} ms`,
            type: "emotion"
        });

        // Get prediction logits
        const preds = results[inferenceSession.outputNames[0]].data as Float16Array;
        const logits = Array.from(preds);
        const maxLogit = Math.max(...logits);

        // Compute softmax to get prediction probabilities
        const exps = logits.map(x => Math.exp(x - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        const probs = exps.map(e => e / sumExps);

        // Get predicted label and confidence score
        const emotions = ["Happy", "Fearful", "Surprised", "Neutral", "Disgusted", "Sad", "Angry"];
        const maxIndex = probs.indexOf(Math.max(...probs));
        const pickedEmotion = emotions[maxIndex] as Emotion;
        const confidence = probs[maxIndex];

        // Log prediction and confidence score
        addLog({
            message: `Predicted emotion: ${pickedEmotion} with ${(confidence * 100).toFixed(1)}% confidence`,
            type: "emotion"
        });

        // Set new emotion
        onEmotionDetected(pickedEmotion, confidence);
    } catch (err) {
        console.error("[EmotionRecorder] Inference error:", err);
    }
}