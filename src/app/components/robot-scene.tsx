"use client"

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { Canvas } from "@react-three/fiber";

type Emotion = "Neutral" | "Happy" | "Sad" | "Angry" | "Fearful" | "Surprised" | "Disgusted";

type Reaction = {
  expression?: Record<string, number>;
  animation?: Record<string, number>; 
}

// Robot model
function Robot({ emotion }: { emotion: Emotion }) {
  const group = useRef<THREE.Group>(null);
  const actions = useRef<{ [key: string]: THREE.AnimationAction }>({});

  // Model and model animation state
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [animation, setAnimation] = useState<THREE.AnimationClip[] | null>(null);

  // Animation mixer
  const [mixer] = useState(() => new THREE.AnimationMixer(new THREE.Group()));

  // Ref for head object with morph targets
  const headRef = useRef<THREE.Mesh | null>(null);

  const emotionRef = useRef<Emotion>("Neutral");
  const lastEmotion = useRef<Emotion>('Neutral');

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

  const reactionMap: Record<Emotion, Reaction> = {
    Neutral: { expression: { Angry: 0, Surprised: 0, Sad: 0 } },
    Happy: { expression: { Angry: 0.5, Surprised: 0.3, Sad: 0.15 }, animation: { "Yes": 1.1 } },
    Sad: { expression: { Sad: 1 } },
    Angry: { expression: { Angry: 1 } },
    Fearful: { expression: { Surprised: 0.75 }, animation: { "Death": 0.5 } },
    Surprised: { expression: { Surprised: 1 }, animation: { "Jump": 1.2 } },
    Disgusted: { expression: { Angry: 1, Sad: 1 }, animation: { "No": 1.1 } },
  };


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

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  // Load the robot model
  useEffect(() => {
    const loader = new GLTFLoader();
    // Load glb file
    loader.load("/RobotExpressive.glb", async (gltf) => {
      // Parse model
      const nodes = await gltf.parser.getDependencies("node");
      const animations = await gltf.parser.getDependencies("animation");
      // const meshes = await gltf.parser.getDependencies('mesh')
      // console.log("nodes", nodes)
      // console.log("meshes", meshes)

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
        material.color.set("#4f63ad");
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
    const emotion = emotionRef.current;
    const reaction = reactionMap[emotion];
    if (!reaction || !headRef.current) return;

    const { morphTargetDictionary: dict, morphTargetInfluences: infl } = headRef.current;
    if (!dict || !infl) return;

    for (const key of Object.keys(dict)) {
      const i = dict[key];
      const targetValue = reaction.expression?.[key] ?? 0;

      // Smooth transition
      infl[i] += (targetValue - infl[i]) * 0.1;
    }
  });


  // Handle animations
  useFrame(() => {
    const current = emotionRef.current;
    if (current !== lastEmotion.current) {
      const reactionAnimation = reactionMap[current]?.animation;
      if (reactionAnimation && animation && group.current) {

        const [animationName, animationTimeScale] = Object.entries(reactionAnimation)[0];
        const clip = animation.find(c => c.name === animationName);

        if (clip) {
          const action = mixer.clipAction(clip, group.current);
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = false;
          action.timeScale = animationTimeScale;
          action.fadeIn(0.2).play();
        }
      }

      lastEmotion.current = current;
    }
  });

  return (
    <>
      {model ? (
        // Set model position
        <group ref={group} scale={0.75} position={[0, -1.5, 0]}>
          <primitive object={model} />
        </group>
      ) : (
        // Display loading message while model loads
        <Html>Loading robot...</Html>
      )}
    </>
  )
}

export default function RobotScene() {
  const [expression, setExpression] = useState<Emotion>("Neutral");
  return (
    <><div style={{ position: "absolute", top: 10, left: 10, zIndex: 100 }}>
      <button onClick={() => setExpression("Neutral")}>Neutral</button><br></br>
      <button onClick={() => setExpression("Happy")}>Happy</button><br></br>
      <button onClick={() => setExpression("Sad")}>Sad</button><br></br>
      <button onClick={() => setExpression("Angry")}>Angry</button><br></br>
      <button onClick={() => setExpression("Fearful")}>Fearful</button><br></br>
      <button onClick={() => setExpression("Surprised")}>Surprised</button><br></br>
      <button onClick={() => setExpression("Disgusted")}>Disgusted</button><br></br>
    </div><Canvas camera={{ position: [0, 1, 7], fov: 45 }}>
        <ambientLight />
        <directionalLight position={[2, 5, 2]} intensity={1} />
        <Robot emotion={expression} />
      </Canvas></>

  )
}