import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Controller('mock')
export class MockController {
  private playlistToFile: Record<string, string> = {
    mock_01: 'mock_songs_80.json',
    mock_02: 'mock_songs_90.json',
    mock_03: 'mock_songs_70.json',
    mock_04: 'mock_songs_hip-hop.json',
    mock_05: 'mock_songs_rock.json',
  };

  @Get('playlists/:id/tracks')
  getMockPlaylistTracks(@Param('id') id: string) {
    const fileName = this.playlistToFile[id];
    if (!fileName) {
      throw new NotFoundException(`Unknown mock playlist id: ${id}`);
    }

    // ✅ Wenn deine JSONs in src/mock/data liegen:
    const filePath = path.join(__dirname, 'data', fileName);

    // ❗ Falls du die JSONs NICHT verschoben hast und sie direkt in src/mock liegen,
    // dann nimm stattdessen:
    // const filePath = path.join(__dirname, fileName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Mock songs file not found: ${fileName}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const tracks = JSON.parse(raw);

    // Erwartet: Array von { id, name, artist, spotifyUri }
    return { playlistId: id, tracks };
  }
}
