export type SessionToken = object;

type TransitionPhase = 'idle' | 'beginning' | 'active' | 'leaving';

export class SessionTransitions {
  private phase: TransitionPhase = 'idle';
  private token: SessionToken | null = null;
  private leavePromise: Promise<void> | null = null;

  begin(): SessionToken | null {
    if (this.phase !== 'idle') return null;

    const token = {};
    this.token = token;
    this.phase = 'beginning';
    return token;
  }

  owns(token: SessionToken): boolean {
    return this.token === token;
  }

  activate(token: SessionToken, onActive: () => void): boolean {
    if (!this.owns(token) || this.phase !== 'beginning') return false;

    this.phase = 'active';
    onActive();
    return true;
  }

  fail(token: SessionToken, onError: () => void): boolean {
    if (!this.owns(token) || this.phase !== 'beginning') return false;

    this.token = null;
    this.phase = 'idle';
    onError();
    return true;
  }

  invalidate(token: SessionToken): boolean {
    if (!this.owns(token)) return false;

    this.token = null;
    if (this.phase !== 'leaving') this.phase = 'idle';
    return true;
  }

  leave(
    token: SessionToken,
    stop: () => Promise<void>,
    onComplete: () => void,
  ): Promise<void> {
    if (this.owns(token) && this.phase === 'leaving' && this.leavePromise !== null) {
      return this.leavePromise;
    }
    if (!this.owns(token) || this.phase !== 'active') return Promise.resolve();

    this.phase = 'leaving';
    let completion!: Promise<void>;
    completion = Promise.resolve()
      .then(stop)
      .finally(() => {
        const stillOwnsSession = this.owns(token) && this.phase === 'leaving';
        if (this.leavePromise === completion) {
          this.leavePromise = null;
          this.phase = 'idle';
        }
        if (!stillOwnsSession) return;

        this.token = null;
        onComplete();
      });
    this.leavePromise = completion;
    return completion;
  }
}
