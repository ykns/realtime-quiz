import { describe, expect, test, vi } from 'vitest';
import Server, { Question } from './Server';
import { Channel } from './messaging';
import Client from './Client';

describe('integration', async () => {
  describe('client enters the right answer', async () => {
    const server = new Server(
      {
        questions: createMockQuestions(),
        requiredNumberOfClients: 1,
        questionTimeLimitSeconds: 10,
      },
      new Channel(),
    );
    await server.init();
    const serverSessionId = '123';
    const serverRunPromise = server.run(serverSessionId);

    const writeConsoleSpy = vi.fn().mockImplementation(() => Promise.resolve());
    const handleUserInputSpy = vi.fn().mockImplementation(() => Promise.resolve(0));
    const client = new Client(new Channel(), writeConsoleSpy, handleUserInputSpy);
    await client.init();
    const clientRunPromise = client.run(serverSessionId, 'Mr. Knowitall');
    const [scores] = await Promise.all([serverRunPromise, clientRunPromise]);

    test('client should have a score of 1', () => {
      expect(scores).toStrictEqual({ [client.clientId]: { name: 'Mr. Knowitall', score: 1 } });
    });
  });

  describe('client enters the wrong answer', async () => {
    const server = new Server(
      {
        questions: createMockQuestions(),
        requiredNumberOfClients: 1,
        questionTimeLimitSeconds: 10,
      },
      new Channel(),
    );
    await server.init();
    const serverSessionId = '123';
    const serverRunPromise = server.run(serverSessionId);

    const writeConsoleSpy = vi.fn().mockImplementation(() => Promise.resolve());
    const handleUserInputSpy = vi.fn().mockImplementation(() => Promise.resolve(2));
    const client = new Client(new Channel(), writeConsoleSpy, handleUserInputSpy);
    await client.init();
    const clientRunPromise = client.run(serverSessionId, 'Mr. Knowitall');
    const [scores] = await Promise.all([serverRunPromise, clientRunPromise]);

    test('client should have a score of 0', () => {
      expect(scores).toStrictEqual({ [client.clientId]: { name: 'Mr. Knowitall', score: 0 } });
    });
  });
});

function createMockQuestions(): Question[] {
  return [
    {
      question: 'What is the capital of France?',
      answers: ['Paris', 'London', 'Berlin', 'Madrid'],
      correctAnswer: 0,
    },
  ];
}
