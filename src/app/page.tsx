"use client"
import dynamic from 'next/dynamic';

const RobotScene = dynamic(() => import("@/app/components/robot-scene"), { ssr: false });

export default function DemoPage() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <RobotScene />
    </div>
  )
}