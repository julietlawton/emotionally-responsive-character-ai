"use client"
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Emotion, DirectedSentiment, EmotionPrediction, SentimentPrediction } from "@/lib/types";

// Robot model
function Robot({
  emotion,
  sentiment,
  robotColor,
  reactionTable,
  isUserSpeaking
}: {
  emotion: EmotionPrediction,
  sentiment: SentimentPrediction,
  robotColor: string,
  reactionTable: any,
  isUserSpeaking: boolean
}) {
  const group = useRef<THREE.Group>(null);
  const actions = useRef<{ [key: string]: THREE.AnimationAction }>({});

  // Model and model animation state
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [animation, setAnimation] = useState<THREE.AnimationClip[] | null>(null);

  // Animation mixer
  const [mixer] = useState(() => new THREE.AnimationMixer(new THREE.Group()));

  // Ref for head object with morph targets
  const headRef = useRef<THREE.Mesh | null>(null);

  // Emotion and sentiment refs
  const emotionRef = useRef<Emotion>("Neutral");
  const lastEmotion = useRef<Emotion>("Neutral");
  const sentimentRef = useRef<DirectedSentiment>("Neutral");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isUserSpeakingRef = useRef(false);

  // Color-able parts of the model
  const partsToColor = [
    { name: "ArmR" },
    { name: "ArmL" },
    { name: "LegR" },
    { name: "LegL" },
    { name: "ShoulderL_1" },
    { name: "ShoulderR_1" },
    { name: "Head_3" },
    { name: "Torso_3" },
    { name: "LowerLegL_1" },
    { name: "LowerLegR_1" },
    { name: "HandR_1" },
    { name: "HandL_1" },
  ];

  // Helper function to find the object with the morph targets for changing facial expression (Head_4)
  function findMeshWithMorphs(root: THREE.Object3D): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;

    root.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.name === "Head_4" &&
        child.morphTargetDictionary
      ) {
        found = child;
      }
    });

    return found;
  }

  // Track when user is speaking for micro-expressions
  useEffect(() => {
    isUserSpeakingRef.current = isUserSpeaking;
  }, [isUserSpeaking]);

  // Handle changes to currently predicted emotion and sentiment
  useEffect(() => {
    // Only update sentiment and emotion if the model confidence is above 60%
    if (emotion.confidence > 0.60) {
      emotionRef.current = emotion.label;
    }
    if (sentiment.confidence > 0.60) {
      sentimentRef.current = sentiment.label;
    }
  }, [emotion, sentiment]);

  // Update expression and animations
  useEffect(() => {
    if (!reactionTable || !emotion || !sentiment) return;

    // Get new reaction
    const reaction = reactionTable[emotionRef.current]?.[sentimentRef.current];
    if (!reaction) return;

    // Clear any previous timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Set timeout to reset emotion/sentiment to Neutral
    if (reaction.duration) {
      timeoutRef.current = setTimeout(() => {
        emotionRef.current = "Neutral";
        sentimentRef.current = "Neutral";
      }, reaction.duration);
    }
  }, [emotion, sentiment, reactionTable]);

  // Load the robot model
  useEffect(() => {
    const loader = new GLTFLoader();
    // Load glb file
    loader.load("/RobotExpressive.glb", async (gltf) => {
      // Parse model
      const nodes = await gltf.parser.getDependencies("node");
      const animations = await gltf.parser.getDependencies("animation");

      // Find Head_4 and set ref
      headRef.current = findMeshWithMorphs(nodes[0]);
      // console.log('Head_4 morph targets:', head.morphTargetDictionary)

      // Set model and its animations
      setModel(nodes[0]);
      setAnimation(animations);
    });
  }, []);

  // Change the color of the model
  useEffect(() => {
    if (!model) return;

    // Change the color of each part
    partsToColor.forEach(({ name }) => {
      const part = model.getObjectByName(name) as THREE.Mesh;

      if (part && part.material instanceof THREE.MeshStandardMaterial) {
        // Clone the material to avoid overwriting it on other parts that share this material
        const material = (part.material as THREE.MeshStandardMaterial).clone();

        // Set the new color for this part
        material.color.set(robotColor);
        part.material = material;
      }
    });
  }, [model]);

  // Set up continuous animation loop
  useEffect(() => {
    if (!animation || !group.current) return;

    // Get wave and idle animation clips
    const waveClip = animation.find(a => a.name === "Wave");
    const idleClip = animation.find(a => a.name === "Idle");

    if (!waveClip || !idleClip) return;

    // Break wave clip into separate head/body animations (this is to allow the arms to reset fully)
    const waveHeadTracks = waveClip.tracks.filter(track => track.name.includes("Head"));
    const waveBodyTracks = waveClip.tracks.filter(track => !track.name.includes("Head"));

    const waveHeadClip = new THREE.AnimationClip("Wave_Head", waveClip.duration, waveHeadTracks);
    const waveBodyClip = new THREE.AnimationClip("Wave_Body", waveClip.duration, waveBodyTracks);

    // Remove tracks that control head movement in the idle clip
    const noHeadTracks = idleClip.tracks.filter(
      (track) =>
        !track.name.includes("Head")
    );

    // Create new clip from idle animation without head movement
    const idleClipNoHead = new THREE.AnimationClip(
      idleClip.name + "_NoHead",
      idleClip.duration,
      noHeadTracks
    );

    // Create mixer actions
    const waveHead = mixer.clipAction(waveHeadClip, group.current)
    const waveBody = mixer.clipAction(waveBodyClip, group.current)
    const idle = mixer.clipAction(idleClipNoHead, group.current);

    actions.current = { waveHead, waveBody, idle };

    // Setup idle (but don't play yet)
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.enabled = true;

    // Setup wave and play only once
    // Clamp head to keep it centered forward
    waveHead.setLoop(THREE.LoopOnce, 1);
    waveHead.clampWhenFinished = true;
    waveHead.fadeIn(0.2).play();

    // Don't clamp body
    waveBody.setLoop(THREE.LoopOnce, 1);
    waveBody.clampWhenFinished = false;
    waveBody.fadeIn(0.2).play();

    // Listen for finished wave event on mixer
    const onFinish = (e: { type: string; action: THREE.AnimationAction }) => {
      if (e.action === waveBody) {
        // Start playing idle animation
        idle.reset().fadeIn(0.3).play();
      }
    };

    mixer.addEventListener("finished", onFinish);

    return () => {
      mixer.removeEventListener("finished", onFinish);
      animation.forEach((clip) => mixer.uncacheClip(clip));
    };
  }, [animation]);

  // Advance animation every frame
  useFrame((_, delta) => {
    mixer.update(delta);
  });

  // Handle facial expressions
  useFrame(() => {
    // Get entry from the reaction table for this sentiment/emotion combo
    const emotion = emotionRef.current;
    const sentiment = sentimentRef.current;
    const emotionReactions = reactionTable?.[emotion];
    if (!emotionReactions) {
      console.warn(`Missing reactionTable entry for emotion: ${emotion}`);
      return;
    }
    const reaction = emotionReactions[sentiment];
    if (!reaction) {
      console.warn(`Missing reaction for sentiment: ${sentiment} under emotion: ${emotion}`);
      return;
    }
    if (!reaction || !headRef.current) return;

    // Get morph targets on head
    const { morphTargetDictionary: dict, morphTargetInfluences: infl } = headRef.current;
    if (!dict || !infl) return;

    // For each of the morph targets, update their values based on the configuration for the current reaction
    for (const key of Object.keys(dict)) {
      const i = dict[key];
      let targetValue = reaction.expression?.[key] ?? 0;

      // Show micro-expression (raise eyebrows) when user starts talking
      if (key === "Surprised" && isUserSpeakingRef.current) {
        targetValue = Math.max(targetValue, 0.15);
      }

      // Smooth transition
      infl[i] += (targetValue - infl[i]) * 0.1;
    }
  });


  // Handle animations
  useFrame(() => {
    const currentEmotion = emotionRef.current;
    const currentSentiment = sentimentRef.current;
    // Don't play the same animation twice in a row for the same emotion back to back
    if (currentEmotion !== lastEmotion.current) {
      // Get animation for this reaction, if there is one
      const reactionAnimation = reactionTable[currentEmotion][currentSentiment]?.animation;
      if (reactionAnimation && animation && group.current) {
        const [animationName] = Object.entries(reactionAnimation)[0];
        const clip = animation.find(c => c.name === animationName);

        // Play animation
        if (clip) {
          const action = mixer.clipAction(clip, group.current);
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = false;
          action.timeScale = 1;
          action.fadeIn(0.2).play();
        }
      }
      lastEmotion.current = currentEmotion;
    }
  });

  return (
    <>
      {model && (
        // Set model position
        <group ref={group} scale={0.75} position={[0, -1.5, 0]}>
          <primitive object={model} />
        </group>
      )}
    </>
  )
}

export default function RobotScene({
  emotion,
  sentiment,
  color,
  reactionTable,
  isUserSpeaking
}: {
  emotion: EmotionPrediction,
  sentiment: SentimentPrediction,
  color: string,
  reactionTable: any,
  isUserSpeaking: boolean
}) {
  return (
    <><div style={{ position: "absolute", top: 10, left: 10, zIndex: 100 }}>
    </div>
      {/* Create three.js scene */}
      <Canvas camera={{ position: [0, 1, 7], fov: 45 }}>
        {/* Scene lighting */}
        <ambientLight intensity={0.2} />
        <directionalLight position={[0, 5, 5]} intensity={2} />
        {/* Robot model */}
        <Robot
          emotion={emotion}
          sentiment={sentiment}
          robotColor={color}
          reactionTable={reactionTable}
          isUserSpeaking={isUserSpeaking}
        />
        {/* Rotation controls */}
        <OrbitControls enableZoom={false} />
      </Canvas>
    </>

  )
}