import { Controller, Get, Param } from '@nestjs/common';

@Controller('mock')
export class MockController {
  @Get('playlists/:id/tracks')
  getMockPlaylistTracks(@Param('id') id: string) {
    return {
      playlistId: id,
      tracks: [
        {
          id: 'track_1',
          name: 'Midnight Echoes',
          artist: 'Neon Avenue',
          spotifyUri: 'spotify:track:1111111111111111111111',
          // später echte URL/Spotify Remote
        },
        {
          id: 'track_2',
          name: 'Ocean Lights',
          artist: 'Silver Static',
          spotifyUri: 'spotify:track:2222222222222222222222',
        },
        {
          id: 'track_3',
          name: 'Paper Planes',
          artist: 'Cloudrunner',
          spotifyUri: 'spotify:track:3333333333333333333333',
        },
        {
          id: 'track_4',
          name: 'Night Drive',
          artist: 'Glass Skyline',
          spotifyUri: 'spotify:track:4444444444444444444444',
        },
      ],
    };
  }
}
