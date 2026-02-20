import { HttpException, Injectable, Logger } from '@nestjs/common';
import { SpotifyService } from '../spotify/spotify.service';
import { CURATED_PLAYLIST_IDS } from './choose.constants';
import { ChoosePlaylist } from './choose.types';

const CHOOSE_CACHE_TTL_MS = 15 * 60 * 1000;

type CachedChoosePlaylists = {
  expiresAt: number;
  playlists: ChoosePlaylist[];
};

@Injectable()
export class ChooseService {
  private readonly logger = new Logger(ChooseService.name);
  private readonly chooseCache = new Map<string, CachedChoosePlaylists>();

  constructor(private readonly spotifyService: SpotifyService) {}

  async getCuratedPlaylists(userId: string): Promise<ChoosePlaylist[]> {
    const cacheKey = String(userId ?? '').trim() || 'global';
    const now = Date.now();
    const cached = this.chooseCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.playlists.map((playlist) => ({ ...playlist }));
    }

    const playlists: ChoosePlaylist[] = [];
    for (const playlistId of CURATED_PLAYLIST_IDS) {
      try {
        const meta = await this.spotifyService.getPlaylistMeta(playlistId);
        playlists.push({
          id: meta.id,
          name: meta.name,
          coverUrl: meta.coverUrl,
        });
      } catch (error) {
        if (
          error instanceof HttpException &&
          (error.getStatus() === 400 || error.getStatus() === 404)
        ) {
          this.logger.warn(
            `[choose] skipping playlist id=${playlistId} status=${error.getStatus()}`,
          );
          continue;
        }
        throw error;
      }
    }

    this.chooseCache.set(cacheKey, {
      expiresAt: now + CHOOSE_CACHE_TTL_MS,
      playlists,
    });

    return playlists.map((playlist) => ({ ...playlist }));
  }
}
