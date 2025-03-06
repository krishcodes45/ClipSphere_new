const express = require('express');
const fs = require('fs');
const http = require('http');
const axios = require('axios');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { Readable } = require('stream');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ELECTRON_HOST,
    methods: ['GET', 'POST'],
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
  },
  region: process.env.BUCKET_REGION,
});

const speechClient = new speech.SpeechClient();

console.log('🟢 Server running on port 5000');
app.use(cors());

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('video-chunks', async (data) => {
    console.log('🟢 Receiving video chunk:', data.filename);

    const filePath = path.join(__dirname, 'temp_upload', data.filename);
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const writeStream = fs.createWriteStream(filePath, { flags: 'a' });

    const buffer = Buffer.from(data.chunks);
    const readStream = Readable.from(buffer);

    readStream.pipe(writeStream).on('finish', () => {
      console.log('🟢 Chunk saved:', data.filename);
    });
  });

  socket.on('process-video', async (data) => {
    const uniqueFilename = `${data.filename}-${uuidv4()}.webm`;
    const filePath = path.join(__dirname, 'temp_upload', data.filename);

    if (!fs.existsSync(filePath)) {
      return console.log('🔴 Error: File does not exist.');
    }

    try {
      console.log('🟢 Verifying WebM file integrity...');
      const isValid = await verifyWebMFile(filePath);
      if (!isValid) {
        console.log('🔴 Invalid WebM file detected, skipping processing.');
        return;
      }

      // 🔹 Notify Next.js API
      await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/processing`, { filename: uniqueFilename });

      // 🔹 Upload video to AWS S3
      const fileBuffer = fs.readFileSync(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: uniqueFilename,
          ContentType: 'video/webm',
          Body: fileBuffer,
        })
      );
      console.log('🟢 Video uploaded to AWS');

      // 🔹 Extract audio from video
      const audioPath = path.join(__dirname, 'temp_upload', `${uuidv4()}.wav`);
      await extractAudio(filePath, audioPath);

      // 🔹 Transcribe Audio using Google Speech-to-Text
      const transcriptionText = await transcribeAudio(audioPath);

      if (transcriptionText) {
        // 🔹 Generate title & summary using Gemini
        const prompt = `You are going to generate a title and a nice description using the speech-to-text transcription provided: transcription(${transcriptionText}). Return it in JSON format as {"title": <the title you gave>, "summary": <the summary you created>}`;
        const completionResponse = await model.generateContent(prompt);
        const completionResult = await completionResponse.response.text();

        await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/transcribe`, {
          filename: uniqueFilename,
          content: completionResult,
          transcript: transcriptionText,
        });
      }

      // 🔹 Mark processing complete
      await axios.post(`${process.env.NEXT_API_HOST}recording/${data.userId}/complete`, { filename: uniqueFilename });

      // 🔹 Cleanup files
      fs.unlinkSync(audioPath);
      fs.unlinkSync(filePath);
      console.log(`🟢 Deleted processed files: ${data.filename}`);
    } catch (error) {
      console.error('🔴 Error processing video:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Socket disconnected:', socket.id);
  });
});

server.listen(5000, () => {
  console.log('🟢 Listening on port 5000');
});

// 🎯 Function: Verify WebM file integrity before processing
async function verifyWebMFile(filePath) {
  return new Promise((resolve) => {
    ffmpeg(filePath)
      .ffprobe((err, metadata) => {
        if (err || !metadata) {
          console.error('🔴 FFprobe could not read WebM metadata:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
  });
}

// 🎯 Function: Extract audio from video
async function extractAudio(videoPath, outputAudioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputAudioPath)
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .on('end', () => resolve(outputAudioPath))
      .on('error', (err) => {
        console.error('🔴 Error extracting audio:', err);
        reject(err);
      })
      .run();
  });
}

// 🎯 Function: Transcribe audio using Google Speech-to-Text
async function transcribeAudio(filePath) {
  const audioBytes = fs.readFileSync(filePath).toString('base64');

  const request = {
    audio: { content: audioBytes },
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
    },
  };

  try {
    const [response] = await speechClient.recognize(request);
    return response.results.map((result) => result.alternatives[0].transcript).join('\n');
  } catch (error) {
    console.error('🔴 Error during transcription:', error);
    return null;
  }
}
