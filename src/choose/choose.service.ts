import { Injectable, Logger } from '@nestjs/common';
import { SpotifyService } from '../spotify/spotify.service';
import { ChoosePlaylist } from './choose.types';

@Injectable()
export class ChooseService {
  private readonly logger = new Logger(ChooseService.name);
  private readonly chooseCache = new Map<string, ChoosePlaylist[]>();

  constructor(private readonly spotifyService: SpotifyService) {}

  async getUserPlaylists(userId: string): Promise<ChoosePlaylist[]> {
    const cacheKey = String(userId ?? '').trim() || 'global';
    const cached = this.chooseCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return cached.map((playlist) => ({ ...playlist }));
    }

    const metaPlaylists = await this.spotifyService.getCurrentUserPlaylistsMeta(cacheKey);
    const playlists = metaPlaylists
      .map((meta) => ({
        id: String(meta.id ?? '').trim(),
        name: String(meta.name ?? '').trim(),
        coverUrl: String(meta.coverUrl ?? '').trim(),
      }))
      .filter((playlist) => Boolean(playlist.id));

    if (playlists.length > 0) {
      this.chooseCache.set(cacheKey, playlists);
    } else {
      this.chooseCache.delete(cacheKey);
    }
    this.logger.log(`[choose] loaded user playlists user=${cacheKey} count=${playlists.length}`);

    return playlists.map((playlist) => ({ ...playlist }));
  }
}
