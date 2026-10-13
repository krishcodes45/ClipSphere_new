
import { updateStudioSettingsSchema } from '@/schemas/studio-setting.schema'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useZodForm } from './useZodForm'
import { useMutation } from '@tanstack/react-query'
import { updateStudioSettings } from '@/lib/utils'
import { useAuth } from '@clerk/clerk-react'

export const useStudioSettings = (
  id: string,
  screen?: string | null,
  audio?: string | null,
  preset?: 'HD' | 'SD',
  plan?: 'PRO' | 'FREE'
) => {
  const { getToken } = useAuth()
  const [onPreset, setPreset] = useState<'HD' | 'SD' | undefined>()

  const { register, watch } = useZodForm(updateStudioSettingsSchema, {
    screen: screen!,
    audio: audio!,
    preset: preset!,
  })


const { mutate, isPending } = useMutation({
    mutationKey: ['update-studio'],
    mutationFn: (data: {
      screen: string;
      id: string;
      audio: string;
      preset: 'HD' | 'SD';
    }) => getToken().then((token) => {
      if (!token) throw new Error('Your sign-in session could not be verified.')
      return updateStudioSettings(data.id, data.screen, data.audio, data.preset, token)
    }),
    onSuccess: (data) => {
      return toast(data.status === 200 ? 'Success' : 'Error', {
        description: data.message,
      });
    },
  });
  
  useEffect(() => {
    if (screen && audio ) {
      window.ipcRenderer.send('media-sources', {
        screen,
        id : id,
        audio,
        preset,
        plan,
      });
    }
  }, [screen , audio]);

  useEffect(() => {
    const subscribe = watch((values) => {
      setPreset(values.preset);
      mutate({
        screen: values.screen!,
        id,
        audio: values.audio!,
        preset: values.preset!,
      });
  
      window.ipcRenderer.send('media-sources', {
        screen: values.screen,
        id,
        audio: values.audio,
        preset: values.preset,
        plan,
      });
    });
  
    return () => subscribe.unsubscribe();
  }, [watch]);
  
  return { register, isPending, onPreset };
}
