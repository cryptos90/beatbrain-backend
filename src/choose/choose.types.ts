export interface ChoosePlaylist {
  id: string;
  name: string;
  coverUrl: string;
  tags?: string[];
  decadeTag?: string;
  categoryType?: 'decade' | 'genre';
  trackCount?: number;
}
