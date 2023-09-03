import * as Ably from 'ably/promises';
import logger from './helpers/logger';
import { ScoreCards } from './Server';

export const SearchEvent = 'search';
export const QuizEvent = 'quiz';

export const ClientSearchMessageType = 'ClientSearchMessageType';
export type ClientSearchMessage = {
  type: typeof ClientSearchMessageType;
  data: { clientId: string };
};
export const ServerSearchReplyMessageType = 'ServerSearchReplyMessageType';
export type ServerSearchReplyMessage = {
  type: typeof ServerSearchReplyMessageType;
  data: { sessionId: string };
};
export const ClientConnectMessageType = 'ClientConnectMessageType';
export type ClientConnectMessage = {
  type: typeof ClientConnectMessageType;
  data: { clientId: string; clientName: string };
};
export const ClientConnectedMessageType = 'ClientConnectedMessageType';
export type ClientConnectedMessage = {
  type: typeof ClientConnectedMessageType;
  data: { sessionId: string; clientId: string };
};
export const QuizAnswerMessageType = 'QuizAnswerMessageType';
export type QuizAnswerMessage = {
  type: typeof QuizAnswerMessageType;
  data: { clientId: string; questionIndex: number; answerIndex: number };
};
export const QuizQuestionMessageType = 'QuizQuestionMessageType';
export type QuizQuestionMessage = {
  type: typeof QuizQuestionMessageType;
  data: { index: number; question: string; answers: string[] };
};
export const QuizQuestionFinishedMessageType = 'QuizQuestionFinishedMessageType';
export type QuizQuestionFinishedMessage = {
  type: typeof QuizQuestionFinishedMessageType;
};
export const QuizScoresMessageType = 'QuizScoresMessageType';
export type QuizScoresMessage = {
  type: typeof QuizScoresMessageType;
  data: { scoreCards: ScoreCards };
};

export type MessageType =
  | typeof ClientSearchMessageType
  | typeof ServerSearchReplyMessageType
  | typeof ClientConnectMessageType
  | typeof ClientConnectedMessageType
  | typeof QuizAnswerMessageType
  | typeof QuizQuestionMessageType
  | typeof QuizQuestionFinishedMessageType
  | typeof QuizScoresMessageType;

export type Message =
  | ClientSearchMessage
  | ServerSearchReplyMessage
  | ClientConnectMessage
  | ClientConnectedMessage
  | QuizAnswerMessage
  | QuizQuestionMessage
  | QuizQuestionFinishedMessage
  | QuizScoresMessage;

export class Channel {
  private client: Ably.Realtime;
  private channel: Ably.Types.RealtimeChannelPromise;
  private subscribers: {
    [key: string]: Array<(message: Ably.Types.Message) => Promise<void>>;
  } = {};

  constructor() {
    this.client = new Ably.Realtime.Promise({ key: process.env.ABLY_API_KEY, echoMessages: false });
    this.channel = this.client.channels.get('quiz');
  }

  async init() {
    await this.channel.attach();
  }

  async destroy() {
    this.client.close();
  }

  getMessageFilter(messagePrefix: string, messageType: string) {
    return `${messagePrefix}:${messageType}`;
  }

  async subscribe<T>(messagePrefix: string, messageType: string, fn: SubscriberFn<T>) {
    if (this.channel.state !== 'attached') {
      throw new Error('Channel is not attached');
    }

    const messageFilter = this.getMessageFilter(messagePrefix, messageType);
    logger.debug('Channel.subscribe: ', messageFilter);
    const subscriber = async (message: Ably.Types.Message) => {
      logger.debug('Channel.subscriber: ', message.data);
      await fn(message.data);
    };
    this.subscribers[messageFilter] = this.subscribers[messageFilter] || [];
    this.subscribers[messageFilter].push(subscriber);
    await this.channel.subscribe(messageFilter, subscriber);
    return () => {
      logger.debug('Channel.unsubscribe: ', messageFilter, messageType);
      this.channel.unsubscribe(messageFilter, subscriber);
    };
  }

  async subscribeOnce<T>(messagePrefix: string, messageType: string, fn: SubscriberFn<T>) {
    const unsubscribe = await this.subscribe(messagePrefix, messageType, async (data: T) => {
      unsubscribe();
      await fn(data);
    });
  }

  async once<T>(messagePrefix: string, messageType: MessageType): Promise<T> {
    const messagePromise = new Promise<T>(async resolve => {
      const unsubscribe = await this.subscribe(messagePrefix, messageType, async (data: T) => {
        unsubscribe();
        resolve(data);
      });
    });
    return await messagePromise;
  }

  unsubscribeAll() {
    logger.debug('Channel.unsubscribeAll');
    this.channel.unsubscribe();
  }

  async publish(messagePrefix: string, messageType: MessageType, message: Message) {
    if (this.channel.state !== 'attached') {
      throw new Error('Channel is not attached');
    }
    const messageFilter = this.getMessageFilter(messagePrefix, messageType);
    logger.debug('Channel.publish: ', messageFilter, message);
    await this.channel.publish(messageFilter, message);
  }
}

export type SubscriberFn<T> = (message: T) => Promise<void>;
