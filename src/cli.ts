import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
import { Command, Option, runExit } from 'clipanion';
import { promises } from 'fs';
import Server from './Server';
import { Channel } from './messaging';
import Client from './Client';
import { generateId } from './helpers/id-generator';

const writeLine = (text: string) => process.stdout.write(`${text}\n`);
const getUserAnswerIndex = async (): Promise<number> => {
  return new Promise(resolve => {
    process.stdin.once('data', data => {
      resolve(parseInt(data.toString()));
    });
  });
};

void runExit([
  class ServerRunCommand extends Command {
    static paths: Array<string[]> = [['server-run']];
    requireNumberOfClients = Option.String();
    questionTimeLimitSeconds = Option.String();
    questionsFilePath = Option.String();

    async execute() {
      const questionsJson = JSON.parse(await promises.readFile(this.questionsFilePath, 'utf8'));
      const server = new Server(
        {
          requiredNumberOfClients: parseInt(this.requireNumberOfClients),
          questionTimeLimitSeconds: parseInt(this.questionTimeLimitSeconds),
          questions: questionsJson,
        },
        new Channel(),
      );
      await server.init();
      await server.run(generateId());
      await server.destroy();
    }
  },
  class ClientSearchCommand extends Command {
    static paths: Array<string[]> = [['client-search']];
    searchTimeoutSeconds = Option.String();

    async execute() {
      const client = new Client(new Channel(), writeLine, getUserAnswerIndex);
      await client.init();
      await client.search({
        timeoutSeconds: parseInt(this.searchTimeoutSeconds),
      });
      await client.destroy();
      this.context.stdout.write(`Done.\n`);
      return 0;
    }
  },
  class ClientRunCommand extends Command {
    static paths: Array<string[]> = [['client-run']];
    clientName = Option.String();
    serverSessionId = Option.String();

    async execute() {
      const client = new Client(new Channel(), writeLine, getUserAnswerIndex);
      await client.init();
      await client.run(this.serverSessionId, this.clientName);
      await client.destroy();
      process.stdin.destroy();
      this.context.stdout.write(`Done.\n`);
      return 0;
    }
  },
]);
