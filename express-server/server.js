const express = require('express');
const fs = require('fs');
const http = require('http');
const axios = require('axios');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { verifyToken } = require('@clerk/backend');

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 5000;
const uploadDirectory = path.join(__dirname, 'temp_upload');
const pendingWrites = new Map();
const allowedOrigins = [
  process.env.ELECTRON_HOST,
  process.env.WEB_APP_API_URL,
  'null',
].filter(Boolean);
const previewOriginPattern = process.env.WEB_APP_PREVIEW_ORIGIN_PATTERN
  ? new RegExp(process.env.WEB_APP_PREVIEW_ORIGIN_PATTERN, 'i')
  : null;
const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin) || Boolean(previewOriginPattern?.test(origin));
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
});

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const model = genAI?.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
});

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
  },
  region: process.env.BUCKET_REGION,
});

const googleServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : undefined;
const speechClient = new speech.SpeechClient(
  googleServiceAccount ? { credentials: googleServiceAccount } : undefined,
);
const apiAuthHeaders = process.env.CLIPSPHERE_WEBHOOK_SECRET
  ? { Authorization: `Bearer ${process.env.CLIPSPHERE_WEBHOOK_SECRET}` }
  : {};

app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) }));
app.get('/health', (_request, response) => response.json({ status: 'ok' }));

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || !process.env.CLERK_SECRET_KEY) return next(new Error('Authentication required.'));
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    if (!claims.sub) return next(new Error('Authentication required.'));
    socket.data.userId = claims.sub;
    next();
  } catch {
    next(new Error('Authentication required.'));
  }
});

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('video-chunks', async (data, acknowledge) => {
    const filename = safeRecordingName(data?.filename);
    if (!filename || !belongsToUser(filename, socket.data.userId) || !data?.chunks) {
      acknowledge?.({ ok: false, error: 'Invalid recording upload chunk.' });
      return;
    }

    const filePath = path.join(uploadDirectory, filename);
    const previousWrite = pendingWrites.get(filePath) || Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
      await fs.promises.mkdir(uploadDirectory, { recursive: true });
      const buffer = Buffer.isBuffer(data.chunks)
        ? data.chunks
        : Buffer.from(data.chunks);
      await fs.promises.appendFile(filePath, buffer);
    });
    pendingWrites.set(filePath, nextWrite);
    nextWrite.then(() => acknowledge?.({ ok: true })).catch((error) => {
      console.error('Unable to save recording chunk:', error.message);
      acknowledge?.({ ok: false, error: 'The recording chunk could not be saved.' });
    }).finally(() => {
      if (pendingWrites.get(filePath) === nextWrite) pendingWrites.delete(filePath);
    });
  });

  socket.on('process-video', async (data, acknowledge) => {
    const filename = safeRecordingName(data?.filename);
    const userId = socket.data.userId;
    const workspaceId = typeof data?.workspaceId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.workspaceId)
      ? data.workspaceId
      : undefined;
    if (!filename || !belongsToUser(filename, userId)) {
      acknowledge?.({ ok: false, error: 'Invalid recording details.' });
      return socket.emit('processing-error', { message: 'Invalid recording details.' });
    }

    const filePath = path.join(uploadDirectory, filename);
    const uniqueFilename = `${path.parse(filename).name}-${uuidv4()}.webm`;

    try {
      await pendingWrites.get(filePath);
    } catch (error) {
      console.error('Unable to finish saving recording:', error.message);
      acknowledge?.({ ok: false, error: 'The recording could not be saved.' });
      return socket.emit('processing-error', { message: 'The recording could not be saved.' });
    }

    if (!fs.existsSync(filePath)) {
      acknowledge?.({ ok: false, error: 'The recording upload is incomplete.' });
      socket.emit('processing-error', { message: 'The recording upload is incomplete. Please try again.' });
      return;
    }

    let audioPath;
    try {
      console.log('🟢 Verifying WebM file integrity...');
      const isValid = await verifyWebMFile(filePath);
      if (!isValid) {
        acknowledge?.({ ok: false, error: 'The recording file could not be opened.' });
        socket.emit('processing-error', { message: 'The recording file could not be opened. Please record again.' });
        return;
      }

      // 🔹 Notify Next.js API
      await axios.post(
        `${process.env.NEXT_API_HOST}recording/${userId}/processing`,
        { filename: uniqueFilename, ...(workspaceId ? { workspaceId } : {}) },
        { headers: apiAuthHeaders }
      );
      acknowledge?.({ ok: true, filename: uniqueFilename });

      // 🔹 Upload video to AWS S3
      await new Upload({
        client: s3,
        params: {
          Bucket: process.env.BUCKET_NAME,
          Key: uniqueFilename,
          ContentType: 'video/webm',
          Body: fs.createReadStream(filePath),
        },
      }).done();
      console.log('🟢 Video uploaded to AWS');

      // 🔹 Extract audio from video
      audioPath = path.join(uploadDirectory, `${uuidv4()}.wav`);
      await extractAudio(filePath, audioPath);

      // 🔹 Transcribe Audio using Google Speech-to-Text
      const transcriptionText = await transcribeAudio(audioPath);

      if (transcriptionText && model) {
        // 🔹 Generate title & summary using Gemini
        const prompt = `You are going to generate a title and a nice description using the speech-to-text transcription provided: transcription(${transcriptionText}). Return it in JSON format as {"title": <the title you gave>, "summary": <the summary you created>}`;
        const completionResponse = await model.generateContent(prompt);
        const completionResult = await completionResponse.response.text();

        await axios.post(`${process.env.NEXT_API_HOST}recording/${userId}/transcribe`, {
          filename: uniqueFilename,
          content: completionResult,
          transcript: transcriptionText,
        }, { headers: apiAuthHeaders });
      }

      // 🔹 Mark processing complete
      await axios.post(
        `${process.env.NEXT_API_HOST}recording/${userId}/complete`,
        { filename: uniqueFilename },
        { headers: apiAuthHeaders }
      );

      // 🔹 Cleanup files
      await fs.promises.unlink(audioPath).catch(() => {});
      await fs.promises.unlink(filePath).catch(() => {});
      console.log(`🟢 Deleted processed files: ${data.filename}`);
    } catch (error) {
      console.error('🔴 Error processing video:', error);
      acknowledge?.({ ok: false, error: 'Video processing could not be started.' });
      socket.emit('processing-error', { message: 'Video processing failed.' });
      await axios.post(
        `${process.env.NEXT_API_HOST}recording/${userId}/failed`,
        { filename: uniqueFilename },
        { headers: apiAuthHeaders }
      ).catch((callbackError) => console.error('Unable to mark recording as failed:', callbackError.message));
      if (typeof audioPath === 'string') await fs.promises.unlink(audioPath).catch(() => {});
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Socket disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`ClipSphere processing server listening on port ${port}`);
});

function safeRecordingName(filename) {
  if (typeof filename !== 'string' || path.basename(filename) !== filename) return null;
  return /^[0-9a-f-]{36}-[a-zA-Z0-9_-]{1,16}\.webm$/i.test(filename)
    ? filename
    : null;
}

function belongsToUser(filename, userId) {
  return typeof userId === 'string' && filename.slice(37, -5) === userId.slice(0, 8);
}

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
  const segmentPrefix = path.join(path.dirname(filePath), `${uuidv4()}-segment-`);
  const segmentPattern = `${segmentPrefix}%03d.wav`;
  const segmentPaths = [];
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions(['-f segment', '-segment_time 50', '-reset_timestamps 1'])
        .output(segmentPattern)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    const prefixName = path.basename(segmentPrefix);
    const names = (await fs.promises.readdir(path.dirname(filePath)))
      .filter((name) => name.startsWith(prefixName) && name.endsWith('.wav'))
      .sort();
    segmentPaths.push(...names.map((name) => path.join(path.dirname(filePath), name)));
    const transcripts = [];
    for (const segmentPath of segmentPaths) {
      const audioBytes = await fs.promises.readFile(segmentPath, 'base64');
      const [response] = await speechClient.recognize({
        audio: { content: audioBytes },
        config: { encoding: 'LINEAR16', sampleRateHertz: 16000, languageCode: 'en-US' },
      });
      transcripts.push(response.results.map((result) => result.alternatives[0].transcript).join('\n'));
    }
    return transcripts.filter(Boolean).join('\n');
  } catch (error) {
    console.error('🔴 Error during transcription:', error);
    return null;
  } finally {
    await Promise.all(segmentPaths.map((segmentPath) => fs.promises.unlink(segmentPath).catch(() => {})));
  }
}
