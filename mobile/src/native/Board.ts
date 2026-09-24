import { NativeModules } from 'react-native';

// Opens the full-screen Board canvas (BoardActivity.kt). The canvas is a bundled HTML page that
// owns drawing, autosave, and the "ask about my drawing" call - it talks to the backend directly,
// so this bridge only launches it with the board id + backend URL. The sessions list lives in RN
// (src/screens/BoardsListScreen.tsx).
type BoardNativeModule = {
  openBoard: (boardId: string, backendBaseUrl: string, title: string) => Promise<boolean>;
};

const { AiosBoard } = NativeModules as { AiosBoard?: BoardNativeModule };

export function getBoardModule(): BoardNativeModule {
  if (!AiosBoard) {
    throw new Error('AiosBoard native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosBoard;
}
