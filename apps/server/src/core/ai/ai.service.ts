import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AiAskDto, AiGenerateDto } from './dto/ai.dto';
import { ChatMessage, OpenAiService } from './openai/openai.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';

interface StreamResponder {
  write: (chunk: string) => void;
  end: () => void;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly openAiService: OpenAiService,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  private ensureOpenAiDriver() {
    if (this.environmentService.getAiDriver() !== 'openai') {
      throw new BadRequestException(
        'AI driver is not set to openai. Set AI_DRIVER=openai.',
      );
    }

    if (this.environmentService.getAiModuleFlavor() === 'enterprise') {
      throw new BadRequestException(
        'Enterprise AI module is not bundled in this build. Set AI_MODULE_FLAVOR=oss or include enterprise module.',
      );
    }
  }

  async generate(dto: AiGenerateDto): Promise<{ content: string }> {
    this.ensureOpenAiDriver();

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const messages = this.buildMessages(dto);

    return this.openAiService.chatCompletion({
      model,
      messages,
      temperature: 0.3,
    });
  }

  async generateStream(dto: AiGenerateDto, res: StreamResponder) {
    this.ensureOpenAiDriver();

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const messages = this.buildMessages(dto);

    try {
      await this.openAiService.chatCompletionStream(
        {
          model,
          messages,
          temperature: 0.3,
        },
        (chunk) => {
          if (chunk?.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        },
      );
      res.write('data: [DONE]\n\n');
    } catch (err) {
      this.logger.error(`AI stream failed`, err as Error);
      throw new InternalServerErrorException('AI stream failed');
    } finally {
      res.end();
    }
  }

  async askStream(dto: AiAskDto, res: StreamResponder) {
    this.ensureOpenAiDriver();

    // enqueue embedding generation for workspace if needed
    if (dto.workspaceId) {
      await this.enqueueWorkspaceEmbedding(dto.workspaceId);
    }

    const model =
      this.environmentService.getAiCompletionModel() || 'gpt-4o-mini';
    const system =
      'You are a helpful documentation assistant. Answer concisely. If you are unsure, say you do not have enough information.';
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: dto.query,
      },
    ];

    try {
      await this.openAiService.chatCompletionStream(
        {
          model,
          messages,
          temperature: 0.2,
        },
        (chunk) => {
          if (chunk?.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        },
      );
      // No sources implemented yet; emit empty sources once.
      res.write(`data: ${JSON.stringify({ sources: [] })}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (err) {
      this.logger.error(`AI ask stream failed`, err as Error);
      throw new InternalServerErrorException('AI ask stream failed');
    } finally {
      res.end();
    }
  }

  private buildMessages(dto: AiGenerateDto): ChatMessage[] {
    const system =
      'You are a helpful writing assistant. Keep responses concise and in the same language as the input.';
    const userPrompt =
      dto.prompt ||
      dto.content ||
      'Help improve the following content while keeping meaning unchanged.';

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ];

    return messages;
  }

  private async enqueueWorkspaceEmbedding(workspaceId: string) {
    // fire-and-forget job to ensure embeddings exist; de-dup by jobId
    const jobId = `workspace-create-embeddings-${workspaceId}`;
    await this.aiQueue.add(
      QueueJob.WORKSPACE_CREATE_EMBEDDINGS,
      { workspaceId },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );
  }
}

