import { generateId } from './helpers/id-generator';
import logger from './helpers/logger';
import {
  Channel,
  ClientConnectMessageType,
  ClientConnectedMessage,
  ClientSearchMessageType,
  QuizAnswerMessageType,
  QuizQuestionFinishedMessageType,
  QuizQuestionMessage,
  QuizQuestionMessageType,
  QuizScoresMessage,
  QuizScoresMessageType,
  SearchEvent,
  ServerSearchReplyMessage,
  ServerSearchReplyMessageType,
  QuizQuestionFinishedMessage,
  ClientConnectedMessageType,
} from './messaging';

type ConsoleWriteLineFn = (text: string) => void;
type GetUserAnswerIndexFn = () => Promise<number>;

export default class Client {
  channel: Channel;
  clientId: string;
  consoleWriteLine: ConsoleWriteLineFn;
  getUserAnswerIndex: GetUserAnswerIndexFn;
  constructor(channel: Channel, consoleWriteLine: ConsoleWriteLineFn, getUserAnswerIndex: GetUserAnswerIndexFn) {
    this.channel = channel;
    this.clientId = generateId();
    this.consoleWriteLine = consoleWriteLine;
    this.getUserAnswerIndex = getUserAnswerIndex;
  }

  async init() {
    logger.debug('Client.init');
    await this.channel.init();
  }

  async destroy() {
    logger.debug('Client.destroy');
    await this.channel.destroy();
  }

  async search(options: { numberOfSessions?: number; timeoutSeconds: number }): Promise<Set<string>> {
    logger.debug('Client.getSessionId');
    this.consoleWriteLine(`Searching for server sessionIds....`);
    const getSessionIdsPromise = new Promise<Set<string>>(async resolve => {
      const sessionIds = new Set<string>();

      const unsubscribe = await this.channel.subscribe<ServerSearchReplyMessage>(
        SearchEvent,
        ServerSearchReplyMessageType,
        async ({ data }: ServerSearchReplyMessage) => {
          sessionIds.add(data.sessionId);
          this.consoleWriteLine(data.sessionId);
          if (sessionIds.size === options.numberOfSessions) {
            resolve(sessionIds);
          }
        },
      );
      setTimeout(() => {
        unsubscribe();
        resolve(sessionIds);
      }, options.timeoutSeconds * 1000);
    });
    await this.channel.publish(SearchEvent, ClientSearchMessageType, {
      type: ClientSearchMessageType,
      data: { clientId: this.clientId },
    });
    logger.debug('Client.getSessionId - fin');
    const serverSessionIds = await getSessionIdsPromise;

    return serverSessionIds;
  }

  async run(sessionId: string, clientName: string): Promise<void> {
    const handleQuizPromise = this.handleQuiz(sessionId);
    const connectToSessionPromise = this.channel.once<ClientConnectedMessage>(sessionId, ClientConnectedMessageType);

    await this.channel.publish(sessionId, ClientConnectMessageType, {
      type: ClientConnectMessageType,
      data: { clientId: this.clientId, clientName },
    });
    logger.info('Client.connectToSessionAndHandleQuiz pending');
    await Promise.all([connectToSessionPromise, handleQuizPromise]);
    logger.info('Client.connectToSessionAndHandleQuiz finished');
  }

  async handleQuiz(sessionId: string): Promise<void> {
    logger.debug('Client.handleQuiz');
    const unsubscribeQuizQuestion = await this.channel.subscribe<QuizQuestionMessage>(
      sessionId,
      QuizQuestionMessageType,
      async (message: QuizQuestionMessage) => {
        logger.debug('Client.handleQuiz - question', message);
        const { index, question, answers } = message.data;

        this.consoleWriteLine(`Question ${index}: ${question}`);
        this.consoleWriteLine(`Answers: ${answers.map((answer, index) => `${index}. ${answer}`).join(', ')}`);
        const timeUpPromise = this.channel.once<QuizQuestionFinishedMessage>(
          sessionId,
          QuizQuestionFinishedMessageType,
        );
        const getUserAnswerIndexPromise = this.getUserAnswerIndex();
        const result = await Promise.race([getUserAnswerIndexPromise, timeUpPromise]);
        if (typeof result === 'number') {
          await this.channel.publish(sessionId, QuizAnswerMessageType, {
            type: QuizAnswerMessageType,
            data: { clientId: this.clientId, questionIndex: index, answerIndex: result },
          });
          this.consoleWriteLine('...');
        } else {
          this.consoleWriteLine('Time is up!');
        }
      },
    );
    logger.debug('Client.handleQuiz - register scores');
    const { data } = await this.channel.once<QuizScoresMessage>(sessionId, QuizScoresMessageType);
    unsubscribeQuizQuestion();
    logger.debug('Client.handleQuiz - scores', data);
    this.consoleWriteLine('Quiz finished, here are the scores:');
    for (const [clientId, name, score] of data.orderedScoreCards) {
      this.consoleWriteLine(`[${clientId}:${name}] ${score} points`);
    }
  }
}
