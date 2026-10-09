import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { resolveMediaRoot } from './media-urls';

const SAFE_NAME = /^[a-f0-9]{16,64}\.(png|jpe?g|webp|gif|bin)$/i;

@Controller('media')
export class MediaController {
  @Get(':filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  stream(@Param('filename') filename: string, @Res() res: Response) {
    if (!SAFE_NAME.test(filename)) {
      throw new NotFoundException('Media not found');
    }
    const fullPath = resolve(resolveMediaRoot(), filename);
    if (!fullPath.startsWith(resolveMediaRoot()) || !existsSync(fullPath)) {
      throw new NotFoundException('Media not found');
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    const type =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(statSync(fullPath).size));
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(fullPath).pipe(res);
  }
}
