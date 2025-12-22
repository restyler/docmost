import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AiService } from './ai.service';
import { AiAskDto, AiGenerateDto } from './dto/ai.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @HttpCode(HttpStatus.OK)
  @Post('generate')
  async generate(@Body() dto: AiGenerateDto) {
    return this.aiService.generate(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('generate/stream')
  async generateStream(
    @Body() dto: AiGenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    await this.aiService.generateStream(dto, res);
  }

  @HttpCode(HttpStatus.OK)
  @Post('ask')
  async ask(
    @Body() dto: AiAskDto,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: Response,
  ): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    // Ensure workspace context is respected if needed later
    dto.workspaceId = dto.workspaceId || workspace?.id;

    await this.aiService.askStream(dto, res);
  }

  @HttpCode(HttpStatus.OK)
  @Get('status')
  async status(@AuthWorkspace() workspace: Workspace) {
    return this.aiService.status(workspace?.id);
  }
}

