'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { io, type Socket } from 'socket.io-client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Stage = 'idle' | 'starting' | 'recording' | 'uploading' | 'processing' | 'error'
type PiPDocumentWindow = Window & {
  documentPictureInPicture?: {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>
    window: Window | null
  }
}

const PROCESSING_URL = process.env.NEXT_PUBLIC_PROCESSING_URL

export function StudioRecorder({ workspaceId, role }: { workspaceId: string; role: string }) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [message, setMessage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [pipDocument, setPipDocument] = useState<Document | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [capturedFilename, setCapturedFilename] = useState('')
  const [includeCamera, setIncludeCamera] = useState(true)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedStreamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const drawFrameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve())
  const filenameRef = useRef('')
  const canRecord = role === 'OWNER' || role === 'EDITOR'

  const closePip = useCallback(() => {
    const pip = (window as PiPDocumentWindow).documentPictureInPicture?.window
    if (pip && !pip.closed) pip.close()
    setPipDocument(null)
  }, [])

  const releaseCapture = useCallback(() => {
    if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current)
    drawFrameRef.current = null
    recorderRef.current = null
    recordedStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordedStreamRef.current = null
    displayStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    displayStreamRef.current = null
    cameraStreamRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    setCameraStream(null)
  }, [])

  useEffect(() => {
    if (stage !== 'recording') return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [stage])

  useEffect(() => {
    if (stage !== 'processing' || !capturedFilename) return
    let active = true
    let attempts = 0
    const poll = async () => {
      if (!active) return
      attempts += 1
      try {
        const response = await fetch(`/api/recordings/status?filename=${encodeURIComponent(capturedFilename)}`, { cache: 'no-store' })
        const payload = await response.json()
        if (response.ok && payload.status === 'READY') {
          if (!active) return
          setStage('idle')
          setMessage('Recording saved to this workspace.')
          router.refresh()
          closePip()
          return
        }
        if (response.ok && payload.status === 'FAILED') {
          if (!active) return
          setStage('error')
          setMessage(payload.error || 'The recording could not be processed. Try recording again.')
          router.refresh()
          closePip()
          return
        }
      } catch {
        // Keep polling through temporary network interruptions.
      }
      if (attempts >= 360) {
        if (active) {
          setStage('error')
          setMessage('Processing is taking longer than expected. Your workspace will update when it finishes.')
          router.refresh()
          closePip()
        }
        return
      }
      window.setTimeout(poll, 5000)
    }
    const timeout = window.setTimeout(poll, 3000)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [capturedFilename, closePip, router, stage])

  useEffect(() => {
    if (!pipDocument || !cameraStream) return
    const pipVideo = pipDocument.querySelector('video')
    if (pipVideo) {
      pipVideo.srcObject = cameraStream
      void pipVideo.play().catch(() => {})
    }
  }, [cameraStream, pipDocument])

  useEffect(() => {
    if (stage === 'recording' || stage === 'uploading') {
      const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
      window.addEventListener('beforeunload', preventClose)
      return () => window.removeEventListener('beforeunload', preventClose)
    }
  }, [stage])

  useEffect(() => () => {
    releaseCapture()
    socketRef.current?.disconnect()
  }, [releaseCapture])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      setStage('uploading')
      setMessage('Finishing upload… Keep this page open.')
      recorder.stop()
    }
  }, [])

  async function startRecording() {
    if (stage === 'starting' || stage === 'recording' || stage === 'uploading' || stage === 'processing') return
    if (!PROCESSING_URL) {
      setStage('error')
      setMessage('The recording service is not configured for this deployment.')
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
      setStage('error')
      setMessage('Use the latest Chrome or Edge browser to record your screen.')
      return
    }

    setStage('starting')
    setMessage('Choose a screen or window, then allow microphone and camera access.')

    // Start all permission-gated browser calls directly from the button gesture.
    const displayRequest = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
    const cameraRequest = navigator.mediaDevices.getUserMedia({
      video: includeCamera ? { facingMode: 'user' } : false,
      audio: true,
    })
    const tokenRequest = getToken()
    const pipApi = (window as PiPDocumentWindow).documentPictureInPicture
    const pipRequest = pipApi?.requestWindow({ width: 340, height: 300 }).catch(() => null) ?? Promise.resolve(null)

    let displayStream: MediaStream | null = null
    let cameraStream: MediaStream | null = null
    let socket: Socket | null = null
    try {
      const captureResults = await Promise.allSettled([
        displayRequest,
        cameraRequest,
      ])
      if (captureResults[0].status === 'fulfilled') displayStream = captureResults[0].value
      if (captureResults[1].status === 'fulfilled') cameraStream = captureResults[1].value
      if (captureResults[0].status === 'rejected') throw captureResults[0].reason
      if (captureResults[1].status === 'rejected') throw captureResults[1].reason
      if (!displayStream || !cameraStream) throw new Error('Chrome did not return the selected capture streams.')
      const [token, pipWindow] = await Promise.all([tokenRequest, pipRequest])
      if (!token) throw new Error('Your sign-in session expired. Sign in again and retry.')
      if (pipWindow) {
        setPipDocument(pipWindow.document)
        pipWindow.addEventListener('pagehide', () => setPipDocument(null), { once: true })
      }
      displayStreamRef.current = displayStream
      cameraStreamRef.current = cameraStream
      setCameraStream(cameraStream)

      const videoTrack = displayStream.getVideoTracks()[0]
      if (!videoTrack) throw new Error('Chrome did not provide a screen video track.')
      const { width = 1280, height = 720 } = videoTrack.getSettings()
      const scale = Math.min(1, 1920 / width, 1080 / height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(2, Math.floor(width * scale))
      canvas.height = Math.max(2, Math.floor(height * scale))
      canvasRef.current = canvas
      const context = canvas.getContext('2d')
      if (!context) throw new Error('The browser could not initialize the recording canvas.')
      const screenVideo = document.createElement('video')
      screenVideo.srcObject = displayStream
      screenVideo.muted = true
      screenVideo.playsInline = true
      screenVideoRef.current = screenVideo
      await screenVideo.play()

      const cameraVideo = document.createElement('video')
      if (cameraStream) {
        cameraVideo.srcObject = cameraStream
        cameraVideo.muted = true
        cameraVideo.playsInline = true
        await cameraVideo.play()
      }
      const draw = () => {
        context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height)
        if (cameraStream?.getVideoTracks().length && cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const diameter = Math.round(canvas.width * 0.17)
          const margin = Math.round(canvas.width * 0.025)
          const x = canvas.width - diameter - margin
          const y = canvas.height - diameter - margin
          context.save()
          context.beginPath()
          context.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, Math.PI * 2)
          context.clip()
          context.drawImage(cameraVideo, x, y, diameter, diameter)
          context.restore()
          context.beginPath()
          context.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, Math.PI * 2)
          context.lineWidth = Math.max(2, canvas.width * 0.003)
          context.strokeStyle = '#e8fff5'
          context.stroke()
        }
        drawFrameRef.current = requestAnimationFrame(draw)
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => { draw(); resolve() }))

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const mixedAudio = audioContext.createMediaStreamDestination()
      for (const stream of [displayStream, cameraStream].filter((value): value is MediaStream => Boolean(value))) {
        for (const track of stream.getAudioTracks()) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]))
          source.connect(mixedAudio)
        }
      }
      await audioContext.resume()
      const outputStream = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...mixedAudio.stream.getAudioTracks(),
      ])
      recordedStreamRef.current = outputStream
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser does not support WebM recording.')

      socket = io(PROCESSING_URL, { autoConnect: false, auth: { token }, transports: ['websocket'], timeout: 90_000, reconnection: false })
      socketRef.current = socket
      setMessage('Connecting to ClipSphere processing… The free server may take a moment to wake.')
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => { socket?.off('connect', onConnect); socket?.off('connect_error', onError); reject(new Error('The recording service did not respond. Please retry in a moment.')) }, 95_000)
        const onConnect = () => { window.clearTimeout(timer); socket?.off('connect_error', onError); resolve() }
        const onError = () => { window.clearTimeout(timer); socket?.off('connect', onConnect); reject(new Error('Could not connect to the recording service. Please retry.')) }
        socket?.once('connect', onConnect)
        socket?.once('connect_error', onError)
        socket?.connect()
      })

      if (!user?.id) throw new Error('Your ClipSphere profile could not be verified.')
      const filename = `${crypto.randomUUID()}-${user.id.slice(0, 8)}.webm`
      filenameRef.current = filename
      setCapturedFilename(filename)
      uploadQueueRef.current = Promise.resolve()

      const recorder = new MediaRecorder(outputStream, { mimeType })
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (!event.data.size || !socket?.connected) return
        const currentSocket = socket
        uploadQueueRef.current = uploadQueueRef.current.then(() => new Promise<void>((resolve, reject) => {
          currentSocket.timeout(30_000).emit('video-chunks', { filename, workspaceId, chunks: event.data }, (error: Error | null, result?: { ok?: boolean; error?: string }) => {
            if (error || !result?.ok) reject(new Error(result?.error || 'A recording upload chunk failed.'))
            else resolve()
          })
        }))
      }
      recorder.onstop = () => {
        void (async () => {
          try {
            await uploadQueueRef.current
            if (!socket?.connected) throw new Error('The upload connection closed before it finished.')
            const accepted = await new Promise<{ ok?: boolean; filename?: string; error?: string }>((resolve, reject) => {
              socket?.timeout(30_000).emit('process-video', { filename, workspaceId }, (error: Error | null, result?: { ok?: boolean; filename?: string; error?: string }) => {
                if (error) reject(new Error('The processing service did not accept this upload.'))
                else if (!result?.ok) reject(new Error(result?.error || 'The recording could not be queued for processing.'))
                else resolve(result)
              })
            })
            setCapturedFilename(accepted.filename || filename)
            setStage('processing')
            setMessage('Recording uploaded. Creating your transcript and summary…')
            socket.disconnect()
            socket = null
            socketRef.current = null
            releaseCapture()
            router.refresh()
          } catch (error) {
            setStage('error')
            setMessage(error instanceof Error ? error.message : 'The recording upload failed.')
            socket?.disconnect()
            socket = null
            socketRef.current = null
            releaseCapture()
            closePip()
          }
        })()
      }
      videoTrack.addEventListener('ended', stopRecording, { once: true })
      startedAtRef.current = Date.now()
      setElapsed(0)
      setStage('recording')
      setMessage('Recording this screen. The camera preview is included in the video.')
      recorder.start(1000)
    } catch (error) {
      displayStream?.getTracks().forEach((track) => track.stop())
      cameraStream?.getTracks().forEach((track) => track.stop())
      socket?.disconnect()
      socketRef.current = null
      releaseCapture()
      closePip()
      setStage('error')
      setMessage(error instanceof Error ? error.message : 'ClipSphere could not start this recording.')
    }
  }

  const time = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`
  const busy = stage === 'starting' || stage === 'uploading' || stage === 'processing'
  const pipControls = pipDocument && createPortal(
    <main style={{ font: '14px system-ui', color: '#eef5f1', background: '#101719', height: '100vh', boxSizing: 'border-box', padding: 14 }}>
      <video muted autoPlay playsInline style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 14, background: '#050707' }} />
      <p style={{ margin: '10px 0', color: '#bad6ca' }}>{stage === 'recording' ? `Recording · ${time}` : message}</p>
      {stage === 'recording' && <button onClick={stopRecording} style={{ width: '100%', padding: 11, border: 0, borderRadius: 10, background: '#ed6d70', color: 'white', fontWeight: 700 }}>Stop recording</button>}
    </main>,
    pipDocument.body
  )

  return <>
    <section className="panel studio-card" aria-label="Browser recording studio">
      <div className="section-heading"><div><span className="eyebrow">CLIPSPHERE STUDIO</span><h2>Record in this workspace</h2></div><span className={`studio-live-dot ${stage === 'recording' ? 'studio-live-active' : ''}`} /></div>
      <p className="muted">Choose a screen, then allow Chrome to share it. Your screen, microphone, and optional camera preview are saved here.</p>
      {stage !== 'recording' && <label className="studio-camera-option"><input type="checkbox" checked={includeCamera} disabled={busy} onChange={(event) => setIncludeCamera(event.target.checked)} /> Include camera preview</label>}
      {cameraStream?.getVideoTracks().length && !pipDocument && <video className="studio-camera-preview" ref={(video) => { if (video && video.srcObject !== cameraStream) { video.srcObject = cameraStream; void video.play().catch(() => {}) } }} muted autoPlay playsInline />}
      <div className="studio-controls">
        {stage === 'recording' ? <><span className="studio-recording-time">● {time}</span><button className="button button-danger" type="button" onClick={stopRecording}>Stop recording</button></> : <button className="button button-primary" type="button" onClick={startRecording} disabled={!canRecord || busy}>{busy ? 'Please wait…' : stage === 'error' ? 'Try again' : 'Start recording'}</button>}
        {!canRecord && <span className="muted">Ask a workspace editor or owner to start a recording.</span>}
      </div>
      {message && <p className={stage === 'error' ? 'inline-error' : 'studio-status'} role={stage === 'error' ? 'alert' : 'status'}>{message}</p>}
      <p className="studio-privacy-note">Chrome asks you to choose what to share and grant access. Recording stops if you stop screen sharing. Keep this page open until the upload finishes.</p>
    </section>
    {pipControls}
  </>
}
