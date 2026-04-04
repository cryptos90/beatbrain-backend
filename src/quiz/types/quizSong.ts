export type QuizSongMinimal = {
  spotifyTrackId: string;
  spotifyTrackUri: string;
  name: string;
  artists: string[];
  albumName: string;
  coverUrl?: string;
  releaseDate?: string;
  releaseYear?: number;
  durationMs: number;
  previewUrl?: string;
  isrc?: string | null;
  isPlayable?: boolean;
  restrictionReason?: string;
  explicit?: boolean;
  popularity?: number;
};

export type QuizSong = QuizSongMinimal;
