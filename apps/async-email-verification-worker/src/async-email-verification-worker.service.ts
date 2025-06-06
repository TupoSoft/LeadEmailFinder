import { Injectable } from '@nestjs/common';

@Injectable()
export class AsyncEmailVerificationWorkerService {
  getHello(): string {
    return 'Hello World!';
  }
}
