import { Injectable } from '@nestjs/common';

/**
 * Source of "now" for all time-dependent business rules (overdue detection, ETA validation,
 * delivery timestamps). Injected so tests can pin the current time.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = date;
  }
}
