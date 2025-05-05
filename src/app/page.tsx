"use client";
import dynamic from "next/dynamic";
import RealtimeChat from "@/app/components/realtime-chat";
import { useEffect, useRef, useState } from "react";
import { EmotionPrediction, SentimentPrediction } from "@/lib/types";
import { useMicrophoneManager } from "@/app/components/microphone-manager";
import SentimentRecorder from "@/app/components/sentiment-recorder";
import { AutoTokenizer } from "@huggingface/transformers";
import { MicrophoneIcon } from "@heroicons/react/24/outline";
import { useLog } from "@/app/context/console-context";
import { JimProfile, LouisaProfile } from "@/lib/robot-profiles";

const RobotScene = dynamic(() => import("@/app/components/robot-scene"), { ssr: false });
const EmotionRecorder = dynamic(() => import("./components/emotion-recorder"), { ssr: false });

// Helper function for checking if the browser supports webgpu
function isWebGPUSupported(): boolean {
  const isSecureContext = window.isSecureContext || location.hostname === "localhost";
  return isSecureContext && "gpu" in navigator;
}

// Helper function for checking if the browser is Chrome and not running on mobile
function isSupportedDeviceBrowser() {
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && !/Edg|OPR|Brave/.test(ua);
  const isDesktop = !/Mobi|Android|iPhone|iPad/i.test(ua);
  return isChrome && isDesktop;
}

// Robot profiles
const robots = [JimProfile, LouisaProfile]

export default function DemoPage() {
  // Device compatibility state
  const [isDeviceSupported, setIsDeviceSupported] = useState(true);
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState(true);

  // Model prediction + onnx runtime state
  const [SERInferenceSession, setSERInferenceSession] = useState(null);
  const [directedSentimentInferenceSession, setDirectedSentimentInferenceSession] = useState(null);
  const tokenizerRef = useRef<any>(null);
  const isInferenceBusy = useRef(false);
  const [emotion, setEmotion] = useState<EmotionPrediction>({ label: "Neutral", confidence: 1 });
  const [sentiment, setSentiment] = useState<SentimentPrediction>({ label: "Neutral", confidence: 1 });

  // App console state
  const [consoleOpen, setConsoleOpen] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const { logs, setLogs } = useLog();

  // Audio component status state
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeChatIsConnecting, setRealtimeChatIsConnecting] = useState(false);
  const [realtimeChatIsReady, setRealtimeChatIsReady] = useState(false);
  const [sentimentRecorderIsConnecting, setSentimentRecorderIsConnecting] = useState(false);
  const [sentimentRecorderIsReady, setSentimentRecorderIsReady] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  // Robot profile state
  const [selectedRobotIndex, setSelectedRobotIndex] = useState(0);
  const selectedRobot = robots[selectedRobotIndex];

  // Microphone state
  const mic = useMicrophoneManager();
  const micReady = mic.isMicActive;
  const componentsReady = realtimeChatIsReady && sentimentRecorderIsReady;
  const isConnecting = mic.isConnecting || realtimeChatIsConnecting || sentimentRecorderIsConnecting;

  let micState: "off" | "connecting" | "ready";

  if (!micReady) {
    micState = "off";
  } else if (isConnecting || !componentsReady) {
    micState = "connecting";
  } else {
    micState = "ready";
  }

  // Check device compatibility
  useEffect(() => {
    setIsDeviceSupported(isSupportedDeviceBrowser());
    setIsWebGPUAvailable(isWebGPUSupported());
  }, []);

  // On app start, load the models + tokenizer and set onnx runtime inference sessions
  useEffect(() => {
    async function loadModels() {
      const ort = await import('onnxruntime-web');
      try {
        // Start speech emotion classifier session
        const ser = await ort.InferenceSession.create("SER_fp32.onnx", { executionProviders: ['webgpu'] });
        // Start sentiment classifier session
        const directedSentiment = await ort.InferenceSession.create("directed-sentiment-model-v1/directed-sentiment-model.onnx");
        // Load sentiment classifier tokenizer
        const tokenizer = await AutoTokenizer.from_pretrained("distilbert-base-uncased");
        setSERInferenceSession(ser);
        setDirectedSentimentInferenceSession(directedSentiment);
        tokenizerRef.current = tokenizer;
        setIsLoading(false);
      } catch (e) {
        console.error("ONNX load error:", e);
        alert("There was an error loading the models. Please reload the page.");
        return;
      }
    }
    loadModels();
  }, []);

  // Auto-scroll the app console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Screen for incompatible device
  if (!isDeviceSupported) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-200 text-center px-4">
        <div>
          <h1 className="text-2xl font-bold mb-4">Unsupported Device or Browser</h1>
          <p>Please use Google Chrome on a desktop or laptop computer to access this demo.</p>
        </div>
      </div>
    );
  }

  // Screen for webgpu not supported
  if (!isWebGPUAvailable) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-200 text-center px-4">
        <div>
          <h1 className="text-2xl font-bold mb-4">WebGPU Not Available</h1>
          <p>Your browser does not support WebGPU, which is required for this demo to run.</p>
          <p className="mt-2">Make sure you're using the latest version of Chrome on desktop with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gray-200 overflow-hidden">
      {/* Show loading spinner while the models and robot load */}
      {isLoading ? (
        <div className="h-full w-full flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold mb-4">Setting Up...</div>
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-black border-solid"></div>
        </div>
      ) : (
        <>
          <div className={`h-full flex items-center justify-center ${consoleOpen ? "pb-12" : ""}`}>
            <RobotScene
              key={selectedRobot.name}
              emotion={emotion}
              sentiment={sentiment}
              color={selectedRobot.color}
              reactionTable={selectedRobot.reactionTable}
              isUserSpeaking={isUserSpeaking} />
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center space-y-4">
            <div className={`flex justify-center items-center gap-x-4 ${consoleOpen ? "" : "pb-12"}`}>
              {/* Switch robot button */}
              <button
                onClick={() => {
                  // Stop the mic, reset emotion/sentiment and switch to the inactive robot
                  if (mic.isMicActive) {
                    mic.stopMic();
                  }
                  setEmotion({ label: "Neutral", confidence: 1 });
                  setSentiment({ label: "Neutral", confidence: 1 })
                  setLogs([]);
                  setSelectedRobotIndex(1 - selectedRobotIndex);
                }}
                className="px-5 py-2 bg-black text-white rounded-full text-sm font-medium shadow-md hover:bg-gray-800 transition"
              >
                Switch Robots
              </button>
              {/* Mic button */}
              <button
                className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors
        ${micState === "off" ? "bg-black hover:bg-gray-800"
                    : micState === "connecting" ? "bg-gray-400"
                      : "bg-red-600"}`}
                onClick={micState === "ready" ? mic.stopMic : mic.startMic}
                disabled={micState === "connecting"}
              >
                <MicrophoneIcon className="w-6 h-6 text-white" />
              </button>
              {/* Toggle app console button */}
              <button
                onClick={() => setConsoleOpen(prev => !prev)}
                className="px-4 py-2 bg-black text-white rounded-full text-sm hover:bg-gray-700 transition"
              >
                {consoleOpen ? "Close Console" : "Open Console"}
              </button>
            </div>
            {/* App console */}
            {consoleOpen && (
              <div ref={consoleRef} className="w-[600px] h-[200px] overflow-y-auto bg-black text-white text-xs p-4 font-mono rounded-lg shadow-lg border border-gray-700">
                {logs.length === 0 ? (
                  <div className="text-white">No logs yet.</div>
                ) : (
                  logs.map((log, i) => {
                    // Set color based on log type and which robot is active
                    const getColor = (type?: string) => {
                      if (type === "emotion") return selectedRobot.name === "Jim" ? "text-teal-400" : "text-violet-300";
                      if (type === "sentiment") return selectedRobot.name === "Jim" ? "text-blue-300" : "text-indigo-300";
                      if (type === "transcription") return selectedRobot.name === "Jim" ? "text-green-300" : "text-fuchsia-400";
                      if (type === "error") return "text-red-400";
                      return "text-white";
                    };
                    const color = getColor(log.type);
                    // Add message type label
                    const label =
                      log.type === "emotion" ? "[Emotion Detector]" :
                        log.type === "sentiment" ? "[Sentiment Detector]" :
                          log.type === "transcription" ? "[Transcription]" :
                            log.type === "error" ? "[Error]" : "[Info]";
                    return (
                      <div key={i} className={`mb-1 ${color}`}>
                        {label} {log.message}
                      </div>
                    )
                  })
                )}

              </div>
            )}
          </div>
          {/* Emotion detection component */}
          {SERInferenceSession && (
            <EmotionRecorder
              mic={mic}
              isUserSpeaking={isUserSpeaking}
              inferenceSession={SERInferenceSession}
              onEmotionDetected={(detectedEmotion, confidence) => { setEmotion({ label: detectedEmotion, confidence: confidence }) }}
              isInferenceBusy={isInferenceBusy}
            />
          )}
          {/* Directed sentiment detection component */}
          {directedSentimentInferenceSession && (
            <SentimentRecorder
              mic={mic}
              setIsConnecting={setSentimentRecorderIsConnecting}
              setIsReady={setSentimentRecorderIsReady}
              isUserSpeaking={isUserSpeaking}
              inferenceSession={directedSentimentInferenceSession}
              tokenizerRef={tokenizerRef}
              onSentimentDetected={(detectedSentiment, confidence) => { setSentiment({ label: detectedSentiment, confidence: confidence }) }}
              isInferenceBusy={isInferenceBusy}
            />
          )}
          {/* Robot chat component */}
          <RealtimeChat
            mic={mic}
            setIsConnecting={setRealtimeChatIsConnecting}
            setIsReady={setRealtimeChatIsReady}
            onSpeechStart={() => setIsUserSpeaking(true)}
            onSpeechStop={() => setIsUserSpeaking(false)}
            voice={selectedRobot.voice}
            profile={selectedRobot.profile}
          />

        </>
      )}
    </div>
  );
}