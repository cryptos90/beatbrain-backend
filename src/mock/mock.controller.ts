import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Controller('mock')
export class MockController {
  private playlistToFile: Record<string, string> = {
    mock_01: 'mock_songs_80s.json',
    mock_02: 'mock_songs_90s.json',
    mock_03: 'mock_songs_70s.json',
    mock_04: 'mock_songs_hip-hop.json',
    mock_05: 'mock_songs_rock.json',
  };

  @Get('playlists/:id/tracks')
  getMockPlaylistTracks(@Param('id') id: string) {
    const fileName = this.playlistToFile[id];

    if (!fileName) {
      throw new NotFoundException('Playlist not found');
    }

    const filePath = path.join(
      process.cwd(),
      'src',
      'mock',
      'data',
      fileName,
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Mock data file not found');
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const tracks = JSON.parse(fileContent);

    return { tracks };
  }
}
