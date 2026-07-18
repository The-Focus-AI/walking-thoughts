export type CaptureLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type LocalCapture = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  status: "saved_locally";
};

export type PersistenceResult = "persisted" | "not_persisted" | "unsupported";

export type CaptureStore = {
  getDraft(): Promise<string>;
  setDraft(text: string): Promise<void>;
  list(): Promise<LocalCapture[]>;
  commit(text: string, location: CaptureLocation | null): Promise<LocalCapture>;
};
