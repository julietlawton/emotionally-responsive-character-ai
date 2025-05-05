export type Emotion =
    | "Happy"
    | "Fearful"
    | "Surprised"
    | "Neutral"
    | "Disgusted"
    | "Sad"
    | "Angry"

export type DirectedSentiment =
    | "Neutral"
    | "Positive"
    | "Negative"

export type EmotionPrediction = { label: Emotion; confidence: number };
export type SentimentPrediction = { label: DirectedSentiment; confidence: number };

export type Reaction = {
    expression: Record<string, number>;
    animation?: Record<string, number>;
    duration: number;
}

export interface RobotProfile {
    name: string;
    color: string;
    voice: string;
    profile: string;
    reactionTable: Record<Emotion, Record<DirectedSentiment, Reaction>>;
  }
  