import { hidePluginWindow } from './utils'
import { v4 as uuid } from 'uuid'
import io from 'socket.io-client'

let videoTransferFileName: string | undefined
let mediaRecorder: MediaRecorder | undefined
let userId: string | undefined
let capturedStream: MediaStream | undefined

const socket = io(import.meta.env.VITE_SOCKET_URL as string, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 3,
  timeout: 10_000,
})

socket.on('processing-error', (payload: { message?: string }) => {
  window.dispatchEvent(new CustomEvent('clipsphere-processing-error', {
    detail: payload?.message || 'The recording could not be processed.',
  }))
})

function connectSocket() {
  if (socket.connected) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', onConnect)
      socket.off('connect_error', onError)
    }
    const onConnect = () => { cleanup(); resolve() }
    const onError = (error: Error) => { cleanup(); reject(error) }
    socket.once('connect', onConnect)
    socket.once('connect_error', onError)
    socket.connect()
  })
}

export const StartRecording = async (
  onSources: { screen: string; audio: string; id: string },
  getToken: () => Promise<string | null>
) => {
  if (!mediaRecorder || mediaRecorder.state !== 'inactive') {
    throw new Error('Choose a display and microphone before recording.')
  }
  const token = await getToken()
  if (!token) throw new Error('Your sign-in session could not be verified.')
  socket.auth = { token }
  await connectSocket()

  userId = onSources.id
  videoTransferFileName = `${uuid()}-${onSources.id.slice(0, 8)}.webm`
  hidePluginWindow(true)
  try {
    mediaRecorder.start(1000)
  } catch (error) {
    hidePluginWindow(false)
    throw error
  }
}

export const onStopRecording = () => {
  if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') {
    mediaRecorder.stop()
  }
}

const processRecording = () => {
  hidePluginWindow(false)
  if (!videoTransferFileName || !userId || !socket.connected) {
    window.dispatchEvent(new CustomEvent('clipsphere-processing-error', {
      detail: 'The recording finished, but the upload connection was lost.',
    }))
    return
  }
  socket.emit('process-video', { filename: videoTransferFileName })
  videoTransferFileName = undefined
}

const onDataAvailable = (event: BlobEvent) => {
  if (event.data.size > 0 && videoTransferFileName && socket.connected) {
    socket.emit('video-chunks', { chunks: event.data, filename: videoTransferFileName })
  }
}

export const selectSources = async (
  onSources: { screen: string; audio: string; id: string; preset: 'HD' | 'SD' },
  videoElement: React.RefObject<HTMLVideoElement>
) => {
  if (!onSources?.screen || !onSources.id) throw new Error('Choose a display before opening the studio.')
  stopCapturedSources()

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: onSources.screen,
        minWidth: onSources.preset === 'HD' ? 1920 : 1280,
        maxWidth: onSources.preset === 'HD' ? 1920 : 1280,
        minHeight: onSources.preset === 'HD' ? 1080 : 720,
        maxHeight: onSources.preset === 'HD' ? 1080 : 720,
        frameRate: 30,
      },
    },
  } as MediaStreamConstraints

  const screenStream = await navigator.mediaDevices.getUserMedia(constraints)
  let microphoneStream: MediaStream | undefined
  try {
    microphoneStream = onSources.audio
      ? await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: onSources.audio } }, video: false })
      : new MediaStream()
    capturedStream = new MediaStream([...screenStream.getTracks(), ...microphoneStream.getTracks()])
    if (videoElement.current) {
      videoElement.current.srcObject = screenStream
      await videoElement.current.play()
    }
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'
    mediaRecorder = new MediaRecorder(capturedStream, { mimeType })
    mediaRecorder.ondataavailable = onDataAvailable
    mediaRecorder.onstop = processRecording
  } catch (error) {
    screenStream.getTracks().forEach((track) => track.stop())
    microphoneStream?.getTracks().forEach((track) => track.stop())
    throw error
  }
}

export const stopCapturedSources = () => {
  capturedStream?.getTracks().forEach((track) => track.stop())
  capturedStream = undefined
  mediaRecorder = undefined
}
