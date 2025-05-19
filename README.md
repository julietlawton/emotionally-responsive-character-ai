# Emotionally Responsive AI Avatars
The goal of this project is to try to create a Next.js app with AI character avatars that feel emotionally responsive by using machine learning to detect affective signals (emotion, directed sentiment) from the user and map these signals to reactive facial expressions.

![louisa_final](https://github.com/user-attachments/assets/c05a7e43-b89d-4af7-ab37-ef7f047cf0f4)

**Read more about this project on Medium:**

[Putting a Face to the Voice: Toward Emotionally Responsive AI Avatars (Part 1)](https://medium.com/)

[Putting a Face to the Voice: Toward Emotionally Responsive AI Avatars (Part 2)](https://medium.com/)

[Putting a Face to the Voice: Toward Emotionally Responsive AI Avatars (Part 3)](https://medium.com/)

## Getting Started
To run the app locally, follow these instructions:

1. Clone the repo
```bash
git clone https://github.com/julietlawton/emotionally-responsive-character-ai.git
cd emotionally-responsive-character-ai
```
2. Install dependencies
```bash
pnpm install
```
4. Set environment variables
   - Create a new file named `.env`
   - Set the following environment variables (required):
     ```env
     OPENAI_API_KEY=<your OpenAI API key> # Used for the realtime chat component
     DEEPGRAM_API_KEY=<your Deepgram API key> # Used for transcription in the sentiment detector component
     ```
   - Note: Deepgram has a $200 free credit for new users, but for the OpenAI Realtime API, please be aware that this model is much more expensive than the others ($40 input/$80 output) per 1 million audio tokens.

5. (Optional) Configure the robot profiles

   If you want to customize the behavior/apperance of the robots, you can do so by modifying `src/lib/robot-profiles.ts` the file.
   In this file you can configure:
   - The color of the robot
   - The voice of the robot (voice options can be tested at https://www.openai.fm)
   - The personality/character background of the robot
   - The facial expression animations for each emotion/sentiment combo

7. Run the development server
```bash
pnpm run dev
```
7. The app should now be up at http://localhost:3000

## Credits

The 3D model used in this project is created by Tomás Laulhe with modifications by Don McCurdy, accessed from the three.js examples repo under the CC0 1.0 license.
