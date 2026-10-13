import { onStopRecording, selectSources, StartRecording, stopCapturedSources } from '@/lib/recorder'
import { cn, videoRecordingTime } from '@/lib/utils'
import { Cast, CircleAlert, LoaderCircle, Pause, Square } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

type RecordingSource = {
  screen: string
  id: string
  audio: string
  preset: 'HD' | 'SD'
  plan: 'PRO' | 'FREE'
}

const StudioTray = () => {
  const { getToken } = useAuth()
  const [preview, setPreview] = useState(false)
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const [onTimer, setOnTimer] = useState('00:00:00')
  const [onSources, setOnSources] = useState<RecordingSource>()
  const [sourceError, setSourceError] = useState('')
  const videoElement = useRef<HTMLVideoElement | null>(null)
  const startedAt = useRef(0)

  useEffect(() => {
    const handleProfile = (_event: unknown, payload: RecordingSource) => {
      if (!payload?.screen || !payload?.id || !payload?.preset || !payload?.plan) return
      setOnSources(payload)
      setSourceError('')
    }
    const handleProcessingError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      toast.error(message || 'The recording could not be processed.')
    }
    window.ipcRenderer.on('profile-recieved', handleProfile)
    window.addEventListener('clipsphere-processing-error', handleProcessingError)
    return () => {
      window.ipcRenderer.off('profile-recieved', handleProfile)
      window.removeEventListener('clipsphere-processing-error', handleProcessingError)
      stopCapturedSources()
    }
  }, [])

  useEffect(() => {
    if (!onSources) return
    let active = true
    selectSources(onSources, videoElement).catch((error: unknown) => {
      if (active) setSourceError(error instanceof Error ? error.message : 'The selected sources could not be opened.')
    })
    return () => {
      active = false
      stopCapturedSources()
    }
  }, [onSources])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      setOnTimer(videoRecordingTime(elapsed).length)
      if (onSources?.plan === 'FREE' && elapsed >= 5 * 60 * 1000) {
        onStopRecording()
        setRecording(false)
        setOnTimer('00:00:00')
        toast('Free recordings have a five minute limit.')
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [recording, onSources?.plan])

  const beginRecording = async () => {
    if (!onSources || starting || recording) return
    setStarting(true)
    try {
      await StartRecording(onSources, getToken)
      startedAt.current = Date.now()
      setOnTimer('00:00:00')
      setRecording(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Recording could not start.')
    } finally {
      setStarting(false)
    }
  }

  const stopRecording = () => {
    onStopRecording()
    setRecording(false)
    setOnTimer('00:00:00')
  }

  if (!onSources) return <div className="flex h-screen flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-[#14191b] p-6 text-center text-white"><LoaderCircle className="animate-spin text-emerald-200"/><p className="text-sm text-white/70">Waiting for your ClipSphere studio settings…</p></div>

  return <div className="flex h-screen flex-col justify-end gap-y-4 rounded-3xl bg-transparent p-2">
    <video autoPlay muted ref={videoElement} className={cn('w-7/12 self-end rounded-xl border border-white/20 bg-black', !preview && 'hidden')} />
    {sourceError && <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-950/90 px-3 py-2 text-xs text-red-100"><CircleAlert size={15}/>{sourceError}</div>}
    <div className="draggable flex h-20 w-full items-center justify-around rounded-full border border-white/25 bg-[#171717] shadow-xl">
      <button type="button" aria-label={recording ? 'Recording in progress' : 'Start recording'} disabled={recording || starting || Boolean(sourceError)} onClick={beginRecording} className={cn('non-draggable relative flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-105 disabled:cursor-wait', recording ? 'bg-red-500' : 'bg-red-400')}>
        {starting ? <LoaderCircle size={17} className="animate-spin text-white"/> : <span className={cn('h-4 w-4 rounded-full bg-red-700', recording && 'animate-pulse')}/>}
        {recording && <span className="absolute -right-[72px] top-1/2 -translate-y-1/2 text-xs tabular-nums text-white">{onTimer}</span>}
      </button>
      {recording ? <button type="button" aria-label="Stop recording" onClick={stopRecording} className="non-draggable rounded-lg p-2 text-white hover:bg-white/10"><Square size={25} fill="white"/></button> : <Pause className="non-draggable opacity-40" size={27} fill="white" stroke="none"/>}
      <button type="button" aria-label={preview ? 'Hide preview' : 'Show preview'} onClick={() => setPreview((value) => !value)} className="non-draggable rounded-lg p-2 text-white hover:bg-white/10"><Cast size={25}/></button>
    </div>
  </div>
}

export default StudioTray
