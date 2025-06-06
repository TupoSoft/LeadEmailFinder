import { Test, TestingModule } from '@nestjs/testing';
import { AsyncEmailVerificationWorkerController } from './async-email-verification-worker.controller';
import { AsyncEmailVerificationWorkerService } from './async-email-verification-worker.service';

describe('AsyncEmailVerificationWorkerController', () => {
  let asyncEmailVerificationWorkerController: AsyncEmailVerificationWorkerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AsyncEmailVerificationWorkerController],
      providers: [AsyncEmailVerificationWorkerService],
    }).compile();

    asyncEmailVerificationWorkerController = app.get<AsyncEmailVerificationWorkerController>(AsyncEmailVerificationWorkerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(asyncEmailVerificationWorkerController.getHello()).toBe('Hello World!');
    });
  });
});
