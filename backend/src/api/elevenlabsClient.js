import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';
import 'dotenv/config';

const elevenlabs = new ElevenLabsClient();

export const makeAudio = async(input, mode) => {
    const voice = mode === 'normal' ? 'JBFqnCBsd6RMkjVDRZzb' : 'GL7nHO5mDrxcHlJPJK5T';
    const audio = await elevenlabs.textToSpeech.convert(
        voice,// "George" - browse voices at elevenlabs.io/app/voice-library
    {
        text: input,
        modelId: 'eleven_v3',
        outputFormat: 'mp3_44100_128',
    }
    );

    return audio;
}

