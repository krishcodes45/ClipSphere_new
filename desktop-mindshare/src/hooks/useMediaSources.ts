import { getMediaSources } from '@/lib/utils';
import { useReducer } from 'react';

export type SourceDeviceStateProps = {
  displays?: {
    appIcon: null;
    display_id: string;
    id: string;
    name: string;
    thumbnail: unknown[];
  }[];
  audioInputs?: {
    deviceId: string;
    kind: string;
    label: string;
    groupId: string;
  }[];
  error?: string | null;
  isPending?: boolean;
};

type DisplayDeviceActionProps = {
  type: 'GET_DEVICES';
  payload: Partial<SourceDeviceStateProps>; // Allow partial updates
};

export const useMediaSources = () => {
  const [state, dispatch] = useReducer(
    (state: SourceDeviceStateProps, action: DisplayDeviceActionProps) => {
      switch (action.type) {
        case 'GET_DEVICES':
          return { ...state, ...action.payload };
        default:
          return state;
      }
    },
    {
      displays: [],
      audioInputs: [],
      error: null,
      isPending: false,
    }
  );

  const fetchMediaResources = async () => {
    dispatch({ type: 'GET_DEVICES', payload: { isPending: true } });

    try {
      const sources = await getMediaSources();
      dispatch({
        type: 'GET_DEVICES',
        payload: {
          displays: sources.displays || [],
          audioInputs: sources.audio || [],
          isPending: false,
        },
      });
    } catch (error) {
      console.error('Failed to fetch media sources:', error);
      dispatch({
        type: 'GET_DEVICES',
        payload: { isPending: false, error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  };

  return { state, fetchMediaResources };
};
