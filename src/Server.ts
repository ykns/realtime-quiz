import {
  Channel,
  ClientSearchMessage,
  ClientConnectMessage,
  QuizAnswerMessage,
  SearchEvent,
  ClientConnectedMessageType,
  ServerSearchReplyMessageType,
  QuizQuestionMessageType,
  QuizQuestionFinishedMessageType,
  QuizScoresMessageType,
  ClientSearchMessageType,
  ClientConnectMessageType,
  QuizAnswerMessageType,
} from './messaging';
import logger from './helpers/logger';

export interface QuizConfig {
  questions: Question[];
  requiredNumberOfClients: number;
  questionTimeLimitSeconds: number;
}

export interface Question {
  question: string;
  answers: string[];
  correctAnswer: number;
}

type ClientId = string;
type Client = {
  id: ClientId;
  name: string;
};
type Clients = {
  [key: ClientId]: Client;
};
export type ScoreCards = {
  [key: ClientId]: {
    name: string;
    score: number;
  };
};

export default class Server {
  quizConfig: QuizConfig;
  channel: Channel;

  constructor(quizConfig: QuizConfig, channel: Channel) {
    this.quizConfig = quizConfig;
    this.channel = channel;
  }

  async init() {
    await this.channel.init();
  }

  async run(serverSessionId: string) {
    logger.info(`Server.run ${serverSessionId}`);
    const clientIds = await this.handleClientSearchAndConnect(serverSessionId);
    const scoreCards = await this.handleQuiz(clientIds, serverSessionId);
    await this.sendScores(serverSessionId, scoreCards);
    await this.destroy();
    return scoreCards;
  }

  async sendScores(serverSessionId: string, scoreCards: ScoreCards) {
    await this.channel.publish(serverSessionId, QuizScoresMessageType, {
      type: QuizScoresMessageType,
      data: { scoreCards },
    });
    logger.info('Server.sendScores finished', scoreCards);
  }

  async destroy() {
    await this.channel.destroy();
  }

  public async handleClientSearchAndConnect(serverSessionId: string): Promise<Clients> {
    logger.info(`Server.handleClientSearchAndConnect - client search `);
    const unsubscribeClientSearch = await this.channel.subscribe<ClientSearchMessage>(
      SearchEvent,
      ClientSearchMessageType,
      async ({}: ClientSearchMessage) => {
        logger.info(`Server reply to client with: ${serverSessionId}`);
        await this.channel.publish(SearchEvent, ServerSearchReplyMessageType, {
          type: ServerSearchReplyMessageType,
          data: { sessionId: serverSessionId },
        });
      },
    );
    logger.info(`Server.handleClientSearchAndConnect - get clients`);
    const getClientsPromise = new Promise<{ clients: Clients; unsubscribe: () => void }>(async resolve => {
      const clients: Clients = {};
      const unsubscribeClientConnect = await this.channel.subscribe<ClientConnectMessage>(
        serverSessionId,
        ClientConnectMessageType,
        async ({ data }: ClientConnectMessage) => {
          clients[data.clientId] = { id: data.clientId, name: data.clientName };
          await this.channel.publish(serverSessionId, ClientConnectedMessageType, {
            type: ClientConnectedMessageType,
            data: { sessionId: serverSessionId, clientId: data.clientId },
          });
          logger.info(`Server.handleClientSearchAndConnect - client connected`, clients);
          if (Object.keys(clients).length === this.quizConfig.requiredNumberOfClients) {
            resolve({
              clients,
              unsubscribe: () => {
                unsubscribeClientConnect();
                unsubscribeClientSearch();
              },
            });
          }
        },
      );
    });

    const { clients, unsubscribe } = await getClientsPromise;
    unsubscribe();
    return clients;
  }

  async handleQuiz(clients: Clients, serverSessionId: string): Promise<ScoreCards> {
    if (Object.keys(clients).length !== this.quizConfig.requiredNumberOfClients) {
      throw new Error('Not enough clients');
    }

    const scores: ScoreCards = Object.fromEntries(
      Object.keys(clients).map(clientId => [
        clientId,
        {
          name: clients[clientId].name,
          score: 0,
        },
      ]),
    );
    const finishedQuestions = new Set<number>();
    for (let questionIndex = 0; questionIndex < this.quizConfig.questions.length; questionIndex++) {
      const question = this.quizConfig.questions[questionIndex];
      const handleQuizAnswerPromise = new Promise(async resolve => {
        const unsubscribeQuizAnswer = await this.channel.subscribe<QuizAnswerMessage>(
          serverSessionId,
          QuizAnswerMessageType,
          async ({ data }: QuizAnswerMessage) => {
            const { clientId, questionIndex, answerIndex: answer } = data;
            logger.info(`Server.handleQuiz - answer`, { clientId, questionIndex, answer });
            if (
              !finishedQuestions.has(questionIndex) &&
              answer === this.quizConfig.questions[questionIndex].correctAnswer
            ) {
              scores[clientId].score++;
            }
          },
        );
        logger.info(`Server.handleQuiz - sending question`, questionIndex);
        await this.channel.publish(serverSessionId, QuizQuestionMessageType, {
          type: QuizQuestionMessageType,
          data: { index: questionIndex, question: question.question, answers: question.answers },
        });
        setTimeout(async () => {
          unsubscribeQuizAnswer();
          await this.channel.publish(serverSessionId, QuizQuestionFinishedMessageType, {
            type: QuizQuestionFinishedMessageType,
          });
          resolve('');
        }, this.quizConfig.questionTimeLimitSeconds * 1000);
      });
      logger.debug('Server.handleQuiz - waiting for answer *************');
      await handleQuizAnswerPromise;
      logger.debug('Server.handleQuiz - waiting for answer *************');
      finishedQuestions.add(questionIndex);
    }
    logger.debug('Server.handleQuiz - finished', scores);
    return scores;
  }
}
