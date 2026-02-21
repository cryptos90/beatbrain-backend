export type QuizSongMinimal = {
  spotifyTrackId: string;
  name: string;
  artists: string[];
  albumName: string;
  coverUrl?: string;
  releaseDate?: string;
  durationMs: number;
  previewUrl?: string;
  explicit?: boolean;
  popularity?: number;
};

export type QuizSong = QuizSongMinimal;
